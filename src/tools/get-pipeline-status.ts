import { z } from 'zod/v3';
import * as pipelineState from '../services/pipeline-state.js';

export const GetPipelineStatusInputSchema = z.object({
  pipeline_id: z.string().describe('Pipeline ID returned from run_full_pipeline'),
});

export type GetPipelineStatusInput = z.infer<typeof GetPipelineStatusInputSchema>;

export interface GetPipelineStatusOutput {
  pipeline_id: string;
  status: 'processing' | 'complete' | 'failed';
  progress: string;
  segments: Array<{
    id: number;
    status: string;
    provider?: string;
    asset_url?: string;
    job_id?: string;
    error?: string;
  }>;
  audio_url: string | null;
  final_video_url: string | null;
  errors: string[];
}

export function getPipelineStatus(input: GetPipelineStatusInput): GetPipelineStatusOutput {
  const state = pipelineState.getPipeline(input.pipeline_id);

  if (!state) {
    return {
      pipeline_id: input.pipeline_id,
      status: 'failed',
      progress: '0/0 segments complete',
      segments: [],
      audio_url: null,
      final_video_url: null,
      errors: [`Pipeline ${input.pipeline_id} not found`],
    };
  }

  const complete = state.segments.filter((s) => s.status === 'complete').length;
  const total = state.segments.length;

  return {
    pipeline_id: state.pipeline_id,
    status: state.status,
    progress: `${complete}/${total} segments complete`,
    segments: state.segments.map((s) => ({
      id: s.id,
      status: s.status,
      provider: s.provider,
      asset_url: s.asset_url,
      job_id: s.job_id,
      error: s.error,
    })),
    audio_url: state.audio_url || null,
    final_video_url: state.final_video_url || null,
    errors: state.errors,
  };
}
