import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as cloudinaryProvider from '../providers/cloudinary.js';
import * as ffmpeg from '../services/ffmpeg.js';
import { AssemblyManifest, PipelineSubstitution } from '../utils/types.js';

const SegmentSchema = z.object({
  segment_id: z.number(),
  asset_url: z.string(),
  asset_type: z.enum(['video', 'image']),
  duration: z.number(),
  start_time: z.number(),
  end_time: z.number(),
  transition_in: z.enum(['cut', 'fade', 'dissolve', 'none']),
  ken_burns: z
    .object({
      enabled: z.boolean(),
      direction: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right']),
    })
    .optional(),
  provider_used: z.string().optional(),
  was_fallback: z.boolean().optional(),
  fallback_reason: z.string().nullable().optional(),
});

export const AssembleVideoInputSchema = z.object({
  segments: z.array(SegmentSchema).describe('All generated segment assets in order'),
  audio_url: z.string().describe('Cloudinary URL of the voiceover audio'),
  output_format: z.string().default('mp4').describe('Output format'),
  resolution: z.string().default('1920x1080').describe('Output resolution'),
});

export type AssembleVideoInput = z.infer<typeof AssembleVideoInputSchema>;

export interface AssembleVideoOutput {
  video_url: string;
  duration_seconds: number;
  resolution: string;
  file_size_mb: number;
  manifest: AssemblyManifest;
}

export async function assembleVideo(input: AssembleVideoInput): Promise<AssembleVideoOutput> {
  const { segments, audio_url, resolution } = input;

  const tempDir = ffmpeg.createTempDir();

  try {
    // 1. Download audio
    const audioPath = path.join(tempDir, 'voiceover.mp3');
    await cloudinaryProvider.downloadFile(audio_url, audioPath);

    // 2. Process each segment
    const processedPaths: Array<{ path: string; duration: number; transition: string }> = [];
    const substitutions: PipelineSubstitution[] = [];
    let generatedAsPlanned = 0;
    let fallbackUsed = 0;
    let degraded = 0;

    for (const seg of segments) {
      const rawPath = path.join(tempDir, `raw_${seg.segment_id}`);
      const normalizedPath = path.join(tempDir, `norm_${seg.segment_id}.mp4`);

      // Track manifest stats
      if (seg.was_fallback && seg.fallback_reason) {
        if (seg.fallback_reason.includes('exhausted') || seg.fallback_reason.includes('Degraded')) {
          degraded++;
        } else {
          fallbackUsed++;
        }
        substitutions.push({
          segment_id: seg.segment_id,
          wanted: 'original',
          used: seg.provider_used || 'unknown',
          reason: seg.fallback_reason,
        });
      } else {
        generatedAsPlanned++;
      }

      if (seg.asset_type === 'image') {
        // Download image
        const imgExt = seg.asset_url.split('?')[0].split('.').pop() || 'jpg';
        const imgPath = `${rawPath}.${imgExt}`;
        await cloudinaryProvider.downloadFile(seg.asset_url, imgPath);

        // Apply Ken Burns if configured
        const kenBurns = seg.ken_burns?.enabled
          ? seg.ken_burns
          : { enabled: true, direction: 'zoom_in' as const };

        await ffmpeg.imageToKenBurnsVideo(imgPath, normalizedPath, seg.duration, kenBurns);
      } else {
        // Download video
        const vidExt = seg.asset_url.split('?')[0].split('.').pop() || 'mp4';
        const vidPath = `${rawPath}.${vidExt}`;
        await cloudinaryProvider.downloadFile(seg.asset_url, vidPath);

        // Normalize to standard resolution and codec
        await ffmpeg.normalizeVideo(vidPath, normalizedPath);
      }

      processedPaths.push({
        path: normalizedPath,
        duration: seg.duration,
        transition: seg.transition_in,
      });
    }

    // 3. Assemble final video with transitions + audio
    const finalPath = path.join(tempDir, 'final.mp4');
    await ffmpeg.assembleWithTransitions(processedPaths, audioPath, finalPath);

    // 4. Get metadata
    const durationSeconds = await ffmpeg.getVideoDuration(finalPath);
    const fileSizeBytes = await ffmpeg.getFileSize(finalPath);
    const fileSizeMb = Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100;

    // 5. Upload to Cloudinary
    const videoUrl = await cloudinaryProvider.uploadFile(
      finalPath,
      'video-pipeline/output',
      'video'
    );

    return {
      video_url: videoUrl,
      duration_seconds: Math.round(durationSeconds * 100) / 100,
      resolution,
      file_size_mb: fileSizeMb,
      manifest: {
        total_segments: segments.length,
        generated_as_planned: generatedAsPlanned,
        fallback_used: fallbackUsed,
        degraded,
        substitutions,
      },
    };
  } finally {
    ffmpeg.cleanupDir(tempDir);
  }
}
