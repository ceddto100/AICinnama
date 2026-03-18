import { PipelineState, PipelineSegmentState } from '../utils/types.js';
import { v4 as uuidv4 } from 'uuid';

// In-memory store (replace with Redis/DB for production multi-instance setups)
const pipelines = new Map<string, PipelineState>();

export function createPipeline(script: string): PipelineState {
  const id = uuidv4();
  const state: PipelineState = {
    pipeline_id: id,
    status: 'processing',
    created_at: Date.now(),
    updated_at: Date.now(),
    script,
    segments: [],
    errors: [],
  };
  pipelines.set(id, state);
  return state;
}

export function getPipeline(id: string): PipelineState | undefined {
  return pipelines.get(id);
}

export function updatePipeline(id: string, updates: Partial<PipelineState>): PipelineState {
  const state = pipelines.get(id);
  if (!state) throw new Error(`Pipeline ${id} not found`);
  const updated = { ...state, ...updates, updated_at: Date.now() };
  pipelines.set(id, updated);
  return updated;
}

export function updateSegment(pipelineId: string, segmentUpdate: PipelineSegmentState): PipelineState {
  const state = pipelines.get(pipelineId);
  if (!state) throw new Error(`Pipeline ${pipelineId} not found`);

  const segments = state.segments.filter((s) => s.id !== segmentUpdate.id);
  segments.push(segmentUpdate);
  segments.sort((a, b) => a.id - b.id);

  const updated = { ...state, segments, updated_at: Date.now() };
  pipelines.set(pipelineId, updated);
  return updated;
}

export function addError(pipelineId: string, error: string): void {
  const state = pipelines.get(pipelineId);
  if (!state) return;
  state.errors.push(error);
  state.updated_at = Date.now();
}

export function completePipeline(pipelineId: string, videoUrl: string): PipelineState {
  return updatePipeline(pipelineId, { status: 'complete', final_video_url: videoUrl });
}

export function failPipeline(pipelineId: string, error: string): PipelineState {
  addError(pipelineId, error);
  return updatePipeline(pipelineId, { status: 'failed' });
}

export function getAllPipelines(): PipelineState[] {
  return Array.from(pipelines.values());
}
