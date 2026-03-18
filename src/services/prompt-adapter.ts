import { ApiProvider } from '../utils/types.js';

/**
 * Adapts a visual prompt to the style/format expected by each provider.
 * Each API has different prompt preferences.
 */
export function adaptPrompt(basePrompt: string, provider: ApiProvider | string): string {
  switch (provider) {
    case 'kling': {
      // Short, punchy. Lead with subject and action. Max ~30 words.
      const words = basePrompt.split(/\s+/).slice(0, 30).join(' ');
      return `${words} 4K cinematic`;
    }

    case 'veo3': {
      // Handles longer descriptive prompts well. Camera movement keywords help.
      return `${basePrompt} Cinematic quality, 4K resolution, film grain, professional color grade.`;
    }

    case 'replicate_svd': {
      // SVD takes an image and animates it — the prompt is for the base image
      return adaptPrompt(basePrompt, 'flux');
    }

    case 'flux': {
      // Comma-separated descriptors. Photorealistic.
      const cleaned = basePrompt.replace(/[.!?]/g, ',').replace(/,+/g, ',').trim();
      return `${cleaned}, photorealistic, 8K resolution, sharp focus, professional photography`;
    }

    case 'sdxl': {
      // Similar to FLUX but add negative prompt hint in positive
      const cleaned = basePrompt.replace(/[.!?]/g, ',').replace(/,+/g, ',').trim();
      return `${cleaned}, high quality, 8K, sharp, no blur, no artifacts, no text`;
    }

    case 'dalle3': {
      // Natural language. Specific and descriptive.
      return `Create a photorealistic, cinematic image: ${basePrompt} High quality, professional photography style, 16:9 aspect ratio.`;
    }

    default:
      return basePrompt;
  }
}

export function buildNegativePrompt(provider: ApiProvider | string): string | undefined {
  switch (provider) {
    case 'sdxl':
      return 'blurry, low resolution, artifacts, text, watermark, bad quality, distorted, ugly';
    case 'flux':
      return undefined; // FLUX Pro doesn't use negative prompts
    default:
      return undefined;
  }
}
