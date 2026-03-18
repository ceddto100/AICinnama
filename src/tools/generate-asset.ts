import { z } from 'zod';
import { ApiProvider, AssetType, KenBurnsConfig } from '../utils/types.js';
import { generateWithFallback } from '../services/fallback-router.js';
import { adaptPrompt } from '../services/prompt-adapter.js';
import * as cloudinary from '../providers/cloudinary.js';

export const GenerateAssetInputSchema = z.object({
  segment_id: z.number().describe('Segment ID'),
  visual_prompt: z.string().describe('Generation prompt from decompose_script'),
  asset_type: z.enum(['video', 'image']).describe('Type of asset to generate'),
  duration: z.number().describe('Target duration in seconds'),
  recommended_api: z
    .enum(['kling', 'veo3', 'replicate_svd', 'flux', 'sdxl', 'dalle3'])
    .describe('Preferred API from decompose_script'),
  ken_burns: z
    .object({
      enabled: z.boolean(),
      direction: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right']),
    })
    .optional()
    .describe('Ken Burns config for image assets'),
});

export type GenerateAssetInput = z.infer<typeof GenerateAssetInputSchema>;

export interface GenerateAssetOutput {
  segment_id: number;
  asset_url: string | null;
  provider_used: string;
  was_fallback: boolean;
  fallback_reason: string | null;
  job_id: string | null;
  status: 'complete' | 'processing' | 'failed';
}

export async function generateAsset(input: GenerateAssetInput): Promise<GenerateAssetOutput> {
  const { segment_id, visual_prompt, asset_type, duration, recommended_api } = input;

  try {
    const { result, providerUsed, wasFallback, fallbackReason } = await generateWithFallback(
      visual_prompt,
      asset_type as AssetType,
      recommended_api as ApiProvider,
      duration,
      (prompt, provider) => adaptPrompt(prompt, provider)
    );

    if (typeof result === 'object' && 'isAsync' in result) {
      // Async job (Kling, Veo3, SVD)
      return {
        segment_id,
        asset_url: null,
        provider_used: providerUsed,
        was_fallback: wasFallback,
        fallback_reason: fallbackReason || null,
        job_id: result.jobId,
        status: 'processing',
      };
    }

    // Sync result (image URL or image used as degraded video)
    // Upload external URL to Cloudinary for permanent storage
    let assetUrl = result as string;
    if (!assetUrl.includes('cloudinary.com')) {
      assetUrl = await cloudinary.uploadUrl(
        assetUrl,
        'video-pipeline/assets',
        asset_type === 'video' ? 'video' : 'image'
      );
    }

    return {
      segment_id,
      asset_url: assetUrl,
      provider_used: providerUsed,
      was_fallback: wasFallback,
      fallback_reason: fallbackReason || null,
      job_id: null,
      status: 'complete',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      segment_id,
      asset_url: null,
      provider_used: 'none',
      was_fallback: true,
      fallback_reason: msg,
      job_id: null,
      status: 'failed',
    };
  }
}
