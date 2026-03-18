import axios from 'axios';
import { config } from '../utils/config.js';
import { QuotaResult } from '../utils/types.js';

const BASE_URL = 'https://api.klingai.com/v1';

export interface KlingJobResult {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  progressPercent?: number;
  error?: string;
}

export async function submitVideoJob(
  prompt: string,
  duration: number,
  aspectRatio: string = '16:9'
): Promise<string> {
  const clampedDuration = duration <= 5 ? '5' : '10';

  const response = await axios.post(
    `${BASE_URL}/videos/text2video`,
    {
      prompt,
      duration: clampedDuration,
      aspect_ratio: aspectRatio,
      mode: 'professional',
    },
    {
      headers: {
        Authorization: `Bearer ${config.kling.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const taskId = response.data?.data?.task_id || response.data?.task_id;
  if (!taskId) throw new Error('Kling did not return a task_id');
  return taskId;
}

export async function pollJobStatus(taskId: string): Promise<KlingJobResult> {
  const response = await axios.get(`${BASE_URL}/videos/text2video/${taskId}`, {
    headers: {
      Authorization: `Bearer ${config.kling.apiKey}`,
    },
  });

  const data = response.data?.data || response.data;
  const status = data?.task_status || data?.status;
  const videoUrl =
    data?.task_result?.videos?.[0]?.url ||
    data?.video_url ||
    undefined;

  const mappedStatus: KlingJobResult['status'] =
    status === 'succeed' || status === 'completed' ? 'completed'
    : status === 'failed' ? 'failed'
    : 'processing';

  return {
    taskId,
    status: mappedStatus,
    videoUrl,
    progressPercent: data?.progress || undefined,
    error: mappedStatus === 'failed' ? (data?.message || 'Unknown error') : undefined,
  };
}

export async function checkQuota(): Promise<QuotaResult> {
  try {
    const response = await axios.get(`${BASE_URL}/account/credits`, {
      headers: { Authorization: `Bearer ${config.kling.apiKey}` },
    });
    const credits = response.data?.data?.remaining || response.data?.remaining || 0;
    return { available: credits > 0, remaining: credits };
  } catch {
    // If quota check fails, assume available
    return { available: true, remaining: -1 };
  }
}
