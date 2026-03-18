export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export type AssetType = 'video' | 'image';
export type ApiProvider = 'kling' | 'veo3' | 'replicate_svd' | 'flux' | 'sdxl' | 'dalle3';
export type CameraStyle = 'wide' | 'close-up' | 'medium' | 'tracking' | 'dolly' | 'aerial' | 'static' | 'handheld';
export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'none';
export type KenBurnsDirection = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';

export interface KenBurnsConfig {
  enabled: boolean;
  direction: KenBurnsDirection;
}

export interface ScriptSegment {
  segment_id: number;
  narration_text: string;
  start_time: number;
  end_time: number;
  duration: number;
  asset_type: AssetType;
  visual_prompt: string;
  camera_style: CameraStyle;
  mood: string;
  transition_in: TransitionType;
  recommended_api: ApiProvider;
  ken_burns?: KenBurnsConfig;
}

export interface GeneratedAsset {
  segment_id: number;
  asset_url: string | null;
  provider_used: string;
  was_fallback: boolean;
  fallback_reason: string | null;
  job_id: string | null;
  status: 'complete' | 'processing' | 'failed';
}

export interface AssemblySegment {
  segment_id: number;
  asset_url: string;
  asset_type: AssetType;
  duration: number;
  start_time: number;
  end_time: number;
  transition_in: TransitionType;
  ken_burns?: KenBurnsConfig;
}

export interface PipelineSubstitution {
  segment_id: number;
  wanted: string;
  used: string;
  reason: string;
}

export interface AssemblyManifest {
  total_segments: number;
  generated_as_planned: number;
  fallback_used: number;
  degraded: number;
  substitutions: PipelineSubstitution[];
}

export interface PipelineSegmentState {
  id: number;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  provider?: string;
  asset_url?: string;
  job_id?: string;
  error?: string;
}

export interface PipelineState {
  pipeline_id: string;
  status: 'processing' | 'complete' | 'failed';
  created_at: number;
  updated_at: number;
  script?: string;
  audio_url?: string;
  segments: PipelineSegmentState[];
  errors: string[];
  final_video_url?: string;
}

export interface QuotaResult {
  available: boolean;
  remaining: number;
}
