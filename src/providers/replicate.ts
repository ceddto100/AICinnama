import axios from 'axios';
import { config } from '../utils/config.js';
import { QuotaResult } from '../utils/types.js';

const BASE_URL = 'https://api.replicate.com/v1';

const MODELS = {
  flux_pro: 'black-forest-labs/flux-pro',
  flux_schnell: 'black-forest-labs/flux-schnell',
  sdxl: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  svd: 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
};

export interface ReplicateResult {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

async function createPrediction(version: string, input: Record<string, unknown>): Promise<string> {
  const response = await axios.post(
    `${BASE_URL}/predictions`,
    { version, input },
    {
      headers: {
        Authorization: `Bearer ${config.replicate.apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.id;
}

async function getPrediction(id: string): Promise<ReplicateResult> {
  const response = await axios.get(`${BASE_URL}/predictions/${id}`, {
    headers: { Authorization: `Bearer ${config.replicate.apiToken}` },
  });
  return response.data;
}

async function waitForPrediction(id: string, maxWaitMs: number = 120000): Promise<ReplicateResult> {
  const start = Date.now();
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() - start < maxWaitMs) {
    const result = await getPrediction(id);
    if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
      return result;
    }
    await delay(3000);
  }
  throw new Error(`Replicate prediction ${id} timed out after ${maxWaitMs}ms`);
}

export async function generateFluxImage(prompt: string): Promise<string> {
  // Use models/run endpoint for newer API format
  const response = await axios.post(
    `${BASE_URL}/models/${MODELS.flux_pro}/predictions`,
    {
      input: {
        prompt,
        width: 1920,
        height: 1080,
        output_format: 'jpg',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.replicate.apiToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
    }
  );

  const predId = response.data.id;
  if (!predId) throw new Error('Replicate did not return prediction ID');

  const result = await waitForPrediction(predId);
  if (result.status !== 'succeeded') {
    throw new Error(`Flux generation failed: ${result.error}`);
  }

  const output = result.output;
  if (Array.isArray(output)) return output[0];
  if (typeof output === 'string') return output;
  throw new Error('Unexpected Flux output format');
}

export async function generateSDXLImage(prompt: string): Promise<string> {
  const predId = await createPrediction(MODELS.sdxl, {
    prompt,
    width: 1920,
    height: 1080,
    num_outputs: 1,
    negative_prompt: 'blurry, artifacts, text, watermark, low quality',
  });

  const result = await waitForPrediction(predId);
  if (result.status !== 'succeeded') {
    throw new Error(`SDXL generation failed: ${result.error}`);
  }

  const output = result.output;
  if (Array.isArray(output)) return output[0];
  if (typeof output === 'string') return output;
  throw new Error('Unexpected SDXL output format');
}

export async function submitSVDJob(imageUrl: string, motionBucketId: number = 127): Promise<string> {
  return createPrediction(MODELS.svd, {
    input_image: imageUrl,
    motion_bucket_id: motionBucketId,
    fps_id: 6,
    decoding_t: 7,
    sizing_strategy: 'input_aspect_ratio',
  });
}

export async function pollSVDJob(predId: string): Promise<ReplicateResult> {
  return getPrediction(predId);
}

export async function checkQuota(): Promise<QuotaResult> {
  try {
    await axios.get(`${BASE_URL}/account`, {
      headers: { Authorization: `Bearer ${config.replicate.apiToken}` },
    });
    return { available: true, remaining: -1 };
  } catch {
    return { available: true, remaining: -1 };
  }
}
