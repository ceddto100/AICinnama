import axios from 'axios';
import { config } from '../utils/config.js';
import { QuotaResult } from '../utils/types.js';

// Veo 3 via Google AI / Vertex AI
// Feature-flagged: set VEO3_ENABLED=true in env to activate
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface Veo3JobResult {
  operationName: string;
  status: 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

export async function submitVideoJob(prompt: string, _duration: number): Promise<string> {
  if (!config.veo3.enabled) {
    throw new Error('Veo3 is disabled. Set VEO3_ENABLED=true to enable.');
  }

  const response = await axios.post(
    `${BASE_URL}/models/veo-003:predictLongRunning?key=${config.veo3.apiKey}`,
    {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: '16:9',
        sampleCount: 1,
      },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const operationName = response.data?.name;
  if (!operationName) throw new Error('Veo3 did not return an operation name');
  return operationName;
}

export async function pollJobStatus(operationName: string): Promise<Veo3JobResult> {
  if (!config.veo3.enabled) {
    return { operationName, status: 'failed', error: 'Veo3 disabled' };
  }

  const response = await axios.get(
    `${BASE_URL}/${operationName}?key=${config.veo3.apiKey}`
  );

  const data = response.data;
  if (!data.done) {
    return { operationName, status: 'processing' };
  }

  if (data.error) {
    return { operationName, status: 'failed', error: data.error.message };
  }

  const videoUrl =
    data.response?.videos?.[0]?.uri ||
    data.response?.predictions?.[0]?.bytesBase64Encoded;

  return { operationName, status: 'completed', videoUrl };
}

export async function checkQuota(): Promise<QuotaResult> {
  if (!config.veo3.enabled) return { available: false, remaining: 0 };
  return { available: true, remaining: -1 };
}
