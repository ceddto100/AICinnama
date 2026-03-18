import OpenAI from 'openai';
import { config } from '../utils/config.js';
import { QuotaResult } from '../utils/types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

export async function generateImage(prompt: string): Promise<string> {
  const openai = getClient();

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'hd',
    response_format: 'url',
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error('DALL-E 3 returned no image URL');
  return url;
}

export async function checkQuota(): Promise<QuotaResult> {
  if (!config.openai.apiKey) return { available: false, remaining: 0 };
  return { available: true, remaining: -1 };
}
