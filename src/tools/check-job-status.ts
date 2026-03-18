import { z } from 'zod/v3';
import * as kling from '../providers/kling.js';
import * as veo3 from '../providers/veo3.js';
import * as replicate from '../providers/replicate.js';
import * as cloudinary from '../providers/cloudinary.js';

export const CheckJobStatusInputSchema = z.object({
  job_id: z.string().describe('Job/task/prediction ID from the provider'),
  provider: z.enum(['kling', 'veo3', 'replicate_svd']).describe('Provider that created the job'),
  segment_id: z.number().describe('Segment this job belongs to'),
});

export type CheckJobStatusInput = z.infer<typeof CheckJobStatusInputSchema>;

export interface CheckJobStatusOutput {
  segment_id: number;
  status: 'complete' | 'processing' | 'failed';
  asset_url: string | null;
  progress_percent: number | null;
  error: string | null;
}

export async function checkJobStatus(input: CheckJobStatusInput): Promise<CheckJobStatusOutput> {
  const { job_id, provider, segment_id } = input;

  try {
    if (provider === 'kling') {
      const result = await kling.pollJobStatus(job_id);

      if (result.status === 'completed' && result.videoUrl) {
        const assetUrl = await cloudinary.uploadUrl(
          result.videoUrl,
          'video-pipeline/assets',
          'video'
        );
        return {
          segment_id,
          status: 'complete',
          asset_url: assetUrl,
          progress_percent: 100,
          error: null,
        };
      }

      if (result.status === 'failed') {
        return {
          segment_id,
          status: 'failed',
          asset_url: null,
          progress_percent: null,
          error: result.error || 'Kling job failed',
        };
      }

      return {
        segment_id,
        status: 'processing',
        asset_url: null,
        progress_percent: result.progressPercent || null,
        error: null,
      };
    }

    if (provider === 'veo3') {
      const result = await veo3.pollJobStatus(job_id);

      if (result.status === 'completed' && result.videoUrl) {
        const assetUrl = await cloudinary.uploadUrl(
          result.videoUrl,
          'video-pipeline/assets',
          'video'
        );
        return {
          segment_id,
          status: 'complete',
          asset_url: assetUrl,
          progress_percent: 100,
          error: null,
        };
      }

      if (result.status === 'failed') {
        return {
          segment_id,
          status: 'failed',
          asset_url: null,
          progress_percent: null,
          error: result.error || 'Veo3 job failed',
        };
      }

      return {
        segment_id,
        status: 'processing',
        asset_url: null,
        progress_percent: null,
        error: null,
      };
    }

    if (provider === 'replicate_svd') {
      const result = await replicate.pollSVDJob(job_id);

      if (result.status === 'succeeded') {
        const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
        if (!outputUrl) throw new Error('SVD returned no output URL');

        const assetUrl = await cloudinary.uploadUrl(
          outputUrl,
          'video-pipeline/assets',
          'video'
        );
        return {
          segment_id,
          status: 'complete',
          asset_url: assetUrl,
          progress_percent: 100,
          error: null,
        };
      }

      if (result.status === 'failed' || result.status === 'canceled') {
        return {
          segment_id,
          status: 'failed',
          asset_url: null,
          progress_percent: null,
          error: result.error || 'Replicate SVD job failed',
        };
      }

      return {
        segment_id,
        status: 'processing',
        asset_url: null,
        progress_percent: null,
        error: null,
      };
    }

    throw new Error(`Unknown provider: ${provider}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      segment_id,
      status: 'failed',
      asset_url: null,
      progress_percent: null,
      error: msg,
    };
  }
}
