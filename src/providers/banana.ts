import axios from 'axios';
import { config } from '../utils/config.js';
import { QuotaResult } from '../utils/types.js';

// Banana.dev SDXL fallback
const BASE_URL = 'https://api.banana.dev';

export async function generateImage(prompt: string): Promise<string> {
  const response = await axios.post(
    `${BASE_URL}/start/v4/`,
    {
      apiKey: config.banana.apiKey,
      modelKey: 'stable-diffusion-xl',
      modelInputs: {
        prompt,
        negative_prompt: 'blurry, low quality, artifacts',
        width: 1920,
        height: 1080,
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const callId = response.data?.callID;
  if (!callId) throw new Error('Banana did not return a callID');

  // Poll for result
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollResp = await axios.post(
      `${BASE_URL}/check/v4/`,
      { apiKey: config.banana.apiKey, callID: callId },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (pollResp.data?.finished) {
      const imageUrl = pollResp.data?.modelOutputs?.[0]?.image_url;
      if (!imageUrl) throw new Error('Banana returned no image URL');
      return imageUrl;
    }
  }
  throw new Error('Banana.dev generation timed out');
}

export async function checkQuota(): Promise<QuotaResult> {
  if (!config.banana.apiKey) return { available: false, remaining: 0 };
  return { available: true, remaining: -1 };
}
