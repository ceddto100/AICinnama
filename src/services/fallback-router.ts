import { ApiProvider, AssetType, QuotaResult } from '../utils/types.js';
import * as kling from '../providers/kling.js';
import * as veo3 from '../providers/veo3.js';
import * as replicate from '../providers/replicate.js';
import * as banana from '../providers/banana.js';
import * as dalle from '../providers/dalle.js';

const VIDEO_CHAIN: ApiProvider[] = ['kling', 'veo3', 'replicate_svd', 'flux'];
const IMAGE_CHAIN: ApiProvider[] = ['flux', 'sdxl', 'dalle3'];

export interface FallbackResult {
  provider: ApiProvider;
  wasOriginal: boolean;
  fallbackReason?: string;
}

export async function resolveProvider(
  preferred: ApiProvider,
  assetType: AssetType
): Promise<FallbackResult> {
  const chain = assetType === 'video' ? VIDEO_CHAIN : IMAGE_CHAIN;
  const preferredIndex = chain.indexOf(preferred);

  // Start from preferred provider, or start of chain if not found
  const startIndex = preferredIndex >= 0 ? preferredIndex : 0;

  for (let i = startIndex; i < chain.length; i++) {
    const provider = chain[i];
    const quota = await checkProviderQuota(provider);
    if (quota.available) {
      return {
        provider,
        wasOriginal: i === startIndex,
        fallbackReason: i > startIndex ? `${chain[i - 1]} unavailable` : undefined,
      };
    }
  }

  // All failed — degrade gracefully
  if (assetType === 'video') {
    // Fall back to image + Ken Burns
    return { provider: 'flux', wasOriginal: false, fallbackReason: 'All video APIs exhausted, using image+KenBurns' };
  }
  // For images, use dalle3 as last resort
  return { provider: 'dalle3', wasOriginal: false, fallbackReason: 'All image APIs exhausted' };
}

async function checkProviderQuota(provider: ApiProvider): Promise<QuotaResult> {
  try {
    switch (provider) {
      case 'kling':
        return await kling.checkQuota();
      case 'veo3':
        return await veo3.checkQuota();
      case 'replicate_svd':
      case 'flux':
      case 'sdxl':
        return await replicate.checkQuota();
      case 'dalle3':
        return await dalle.checkQuota();
      default:
        return { available: true, remaining: -1 };
    }
  } catch {
    // If quota check fails, assume available and let the actual call fail
    return { available: true, remaining: -1 };
  }
}

export async function generateWithFallback(
  prompt: string,
  assetType: AssetType,
  preferred: ApiProvider,
  duration: number,
  adaptedPromptFn: (prompt: string, provider: ApiProvider) => string
): Promise<{
  result: string | { jobId: string; isAsync: true };
  providerUsed: ApiProvider;
  wasFallback: boolean;
  fallbackReason?: string;
}> {
  const chain = assetType === 'video' ? VIDEO_CHAIN : IMAGE_CHAIN;
  const preferredIndex = chain.indexOf(preferred);
  const startIndex = preferredIndex >= 0 ? preferredIndex : 0;

  const errors: string[] = [];

  for (let i = startIndex; i < chain.length; i++) {
    const provider = chain[i];
    const adaptedPrompt = adaptedPromptFn(prompt, provider);

    try {
      const quota = await checkProviderQuota(provider);
      if (!quota.available) {
        errors.push(`${provider}: quota exhausted`);
        continue;
      }

      if (assetType === 'video') {
        if (provider === 'kling') {
          const jobId = await kling.submitVideoJob(adaptedPrompt, duration);
          return {
            result: { jobId, isAsync: true },
            providerUsed: provider,
            wasFallback: i > startIndex,
            fallbackReason: i > startIndex ? errors.join('; ') : undefined,
          };
        } else if (provider === 'veo3') {
          const jobId = await veo3.submitVideoJob(adaptedPrompt, duration);
          return {
            result: { jobId, isAsync: true },
            providerUsed: provider,
            wasFallback: i > startIndex,
            fallbackReason: i > startIndex ? errors.join('; ') : undefined,
          };
        } else if (provider === 'replicate_svd') {
          // SVD needs an image first — generate with FLUX
          const fluxPrompt = adaptedPromptFn(prompt, 'flux');
          const imageUrl = await replicate.generateFluxImage(fluxPrompt);
          const jobId = await replicate.submitSVDJob(imageUrl);
          return {
            result: { jobId, isAsync: true },
            providerUsed: provider,
            wasFallback: i > startIndex,
            fallbackReason: i > startIndex ? errors.join('; ') : undefined,
          };
        } else if (provider === 'flux') {
          // Degraded: image + Ken Burns
          const imageUrl = await replicate.generateFluxImage(adaptedPrompt);
          return {
            result: imageUrl,
            providerUsed: provider,
            wasFallback: true,
            fallbackReason: errors.length > 0 ? errors.join('; ') : 'Degraded to image+KenBurns',
          };
        }
      } else {
        // Image generation
        if (provider === 'flux') {
          const url = await replicate.generateFluxImage(adaptedPrompt);
          return { result: url, providerUsed: provider, wasFallback: i > startIndex, fallbackReason: i > startIndex ? errors.join('; ') : undefined };
        } else if (provider === 'sdxl') {
          const url = await replicate.generateSDXLImage(adaptedPrompt);
          return { result: url, providerUsed: provider, wasFallback: i > startIndex, fallbackReason: i > startIndex ? errors.join('; ') : undefined };
        } else if (provider === 'dalle3') {
          const url = await dalle.generateImage(adaptedPrompt);
          return { result: url, providerUsed: provider, wasFallback: i > startIndex, fallbackReason: i > startIndex ? errors.join('; ') : undefined };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${msg}`);
      continue;
    }
  }

  // All providers failed
  throw new Error(`All ${assetType} generation providers failed: ${errors.join('; ')}`);
}
