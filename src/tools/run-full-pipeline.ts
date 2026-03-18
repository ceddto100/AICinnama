import { z } from 'zod';
import { generateVoiceover } from './generate-voiceover.js';
import { decomposeScript } from './decompose-script.js';
import { generateAsset } from './generate-asset.js';
import { checkJobStatus } from './check-job-status.js';
import { assembleVideo } from './assemble-video.js';
import * as pipelineState from '../services/pipeline-state.js';
import { ScriptSegment, AssemblySegment } from '../utils/types.js';

export const RunFullPipelineInputSchema = z.object({
  script: z.string().describe('The full narration text'),
  voice_id: z.string().optional().describe('Optional ElevenLabs voice ID'),
  style: z.string().optional().describe("Optional style guidance, e.g. 'documentary'"),
  resolution: z.string().default('1920x1080').describe('Output resolution'),
});

export type RunFullPipelineInput = z.infer<typeof RunFullPipelineInputSchema>;

const ASYNC_PROVIDERS = ['kling', 'veo3', 'replicate_svd'];
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ATTEMPTS = 45; // ~6 minutes

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runFullPipeline(input: RunFullPipelineInput) {
  const { script, voice_id, style, resolution } = input;

  // Create pipeline state entry
  const state = pipelineState.createPipeline(script);
  const pipelineId = state.pipeline_id;

  try {
    // ── Step 1: Generate voiceover ─────────────────────────────────────────
    console.error(`[pipeline:${pipelineId}] Generating voiceover...`);
    const voiceoverResult = await generateVoiceover({ script, voice_id });
    pipelineState.updatePipeline(pipelineId, { audio_url: voiceoverResult.audio_url });

    // ── Step 2: Decompose script into segments ─────────────────────────────
    console.error(`[pipeline:${pipelineId}] Decomposing script...`);
    const segments: ScriptSegment[] = await decomposeScript({
      script,
      word_timestamps: voiceoverResult.word_timestamps,
      total_duration: voiceoverResult.duration_seconds,
      style_guidance: style,
    });

    // Initialize segment state
    for (const seg of segments) {
      pipelineState.updateSegment(pipelineId, { id: seg.segment_id, status: 'pending' });
    }

    // ── Step 3: Generate all assets ────────────────────────────────────────
    console.error(`[pipeline:${pipelineId}] Generating ${segments.length} assets...`);

    const assetResults = new Map<
      number,
      { assetUrl: string | null; jobId: string | null; provider: string; wasFallback: boolean; fallbackReason: string | null; status: string }
    >();

    // Submit all jobs (in parallel for async, sequential for sync to avoid rate limits)
    const jobPromises = segments.map(async (seg) => {
      pipelineState.updateSegment(pipelineId, { id: seg.segment_id, status: 'processing' });

      const result = await generateAsset({
        segment_id: seg.segment_id,
        visual_prompt: seg.visual_prompt,
        asset_type: seg.asset_type,
        duration: seg.duration,
        recommended_api: seg.recommended_api,
        ken_burns: seg.ken_burns,
      });

      assetResults.set(seg.segment_id, {
        assetUrl: result.asset_url,
        jobId: result.job_id,
        provider: result.provider_used,
        wasFallback: result.was_fallback,
        fallbackReason: result.fallback_reason,
        status: result.status,
      });

      pipelineState.updateSegment(pipelineId, {
        id: seg.segment_id,
        status: result.status === 'complete' ? 'complete' : result.status === 'failed' ? 'failed' : 'processing',
        provider: result.provider_used,
        asset_url: result.asset_url || undefined,
        job_id: result.job_id || undefined,
      });
    });

    await Promise.all(jobPromises);

    // ── Step 4: Poll async jobs until complete ─────────────────────────────
    const asyncJobs = Array.from(assetResults.entries()).filter(
      ([, r]) => r.status === 'processing' && r.jobId
    );

    if (asyncJobs.length > 0) {
      console.error(`[pipeline:${pipelineId}] Polling ${asyncJobs.length} async jobs...`);

      const pendingJobs = new Map(
        asyncJobs.map(([segId, r]) => [segId, { jobId: r.jobId!, provider: r.provider }])
      );

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && pendingJobs.size > 0; attempt++) {
        await delay(POLL_INTERVAL_MS);

        const pollPromises = Array.from(pendingJobs.entries()).map(async ([segId, job]) => {
          const provider = job.provider as 'kling' | 'veo3' | 'replicate_svd';
          if (!ASYNC_PROVIDERS.includes(provider)) {
            pendingJobs.delete(segId);
            return;
          }

          const status = await checkJobStatus({
            job_id: job.jobId,
            provider,
            segment_id: segId,
          });

          if (status.status === 'complete' && status.asset_url) {
            const existing = assetResults.get(segId)!;
            assetResults.set(segId, { ...existing, assetUrl: status.asset_url, status: 'complete' });
            pipelineState.updateSegment(pipelineId, {
              id: segId,
              status: 'complete',
              asset_url: status.asset_url,
              provider: existing.provider,
            });
            pendingJobs.delete(segId);
          } else if (status.status === 'failed') {
            // Try fallback for this segment
            const seg = segments.find((s) => s.segment_id === segId)!;
            console.error(`[pipeline:${pipelineId}] Segment ${segId} failed on ${job.provider}, trying fallback...`);

            const fallbackResult = await generateAssetWithNextProvider(seg, job.provider);
            assetResults.set(segId, {
              assetUrl: fallbackResult.assetUrl,
              jobId: fallbackResult.jobId,
              provider: fallbackResult.provider,
              wasFallback: true,
              fallbackReason: `${job.provider} failed: ${status.error}`,
              status: fallbackResult.isAsync ? 'processing' : (fallbackResult.assetUrl ? 'complete' : 'failed'),
            });

            if (!fallbackResult.isAsync) {
              pipelineState.updateSegment(pipelineId, {
                id: segId,
                status: fallbackResult.assetUrl ? 'complete' : 'failed',
                asset_url: fallbackResult.assetUrl || undefined,
                provider: fallbackResult.provider,
              });
              pendingJobs.delete(segId);
            } else if (fallbackResult.jobId) {
              pendingJobs.set(segId, { jobId: fallbackResult.jobId, provider: fallbackResult.provider });
            } else {
              pendingJobs.delete(segId);
            }
          }
        });

        await Promise.all(pollPromises);
      }
    }

    // ── Step 5: Assemble final video ───────────────────────────────────────
    console.error(`[pipeline:${pipelineId}] Assembling final video...`);

    const assemblySegments: AssemblySegment[] = segments
      .map((seg) => {
        const result = assetResults.get(seg.segment_id);
        const assetUrl = result?.assetUrl || null;

        if (!assetUrl) {
          pipelineState.addError(pipelineId, `Segment ${seg.segment_id} has no asset — will be skipped`);
          return null;
        }

        return {
          segment_id: seg.segment_id,
          asset_url: assetUrl,
          asset_type: seg.asset_type,
          duration: seg.duration,
          start_time: seg.start_time,
          end_time: seg.end_time,
          transition_in: seg.transition_in,
          ken_burns: seg.ken_burns,
          provider_used: result?.provider,
          was_fallback: result?.wasFallback || false,
          fallback_reason: result?.fallbackReason || null,
        } as AssemblySegment & { provider_used?: string; was_fallback?: boolean; fallback_reason?: string | null };
      })
      .filter(Boolean) as (AssemblySegment & { provider_used?: string; was_fallback?: boolean; fallback_reason?: string | null })[];

    if (assemblySegments.length === 0) {
      throw new Error('No segments available for assembly');
    }

    const assembled = await assembleVideo({
      segments: assemblySegments,
      audio_url: voiceoverResult.audio_url,
      output_format: 'mp4',
      resolution: resolution || '1920x1080',
    });

    pipelineState.completePipeline(pipelineId, assembled.video_url);

    return {
      pipeline_id: pipelineId,
      ...assembled,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pipelineState.failPipeline(pipelineId, msg);
    throw err;
  }
}

// Helper: try next provider in chain after a failure
async function generateAssetWithNextProvider(
  seg: ScriptSegment,
  failedProvider: string
): Promise<{ assetUrl: string | null; jobId: string | null; provider: string; isAsync: boolean }> {
  const videoChain = ['kling', 'veo3', 'replicate_svd', 'flux'];
  const imageChain = ['flux', 'sdxl', 'dalle3'];
  const chain = seg.asset_type === 'video' ? videoChain : imageChain;
  const failedIdx = chain.indexOf(failedProvider);
  const nextProvider = chain[failedIdx + 1] || (seg.asset_type === 'video' ? 'flux' : 'dalle3');

  const result = await generateAsset({
    segment_id: seg.segment_id,
    visual_prompt: seg.visual_prompt,
    asset_type: seg.asset_type,
    duration: seg.duration,
    recommended_api: nextProvider as any,
    ken_burns: seg.ken_burns,
  });

  return {
    assetUrl: result.asset_url,
    jobId: result.job_id,
    provider: result.provider_used,
    isAsync: result.status === 'processing',
  };
}
