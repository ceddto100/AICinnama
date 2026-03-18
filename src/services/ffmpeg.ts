import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KenBurnsConfig, KenBurnsDirection, AssemblySegment } from '../utils/types.js';

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}:\n${stderr}`));
    });

    proc.on('error', (err) => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
  });
}

export function buildKenBurnsFilter(direction: KenBurnsDirection, duration: number): string {
  const frames = Math.ceil(duration * 25);
  switch (direction) {
    case 'zoom_in':
      return `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=25`;
    case 'zoom_out':
      return `zoompan=z='max(1.5-0.0015*on,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=25`;
    case 'pan_left':
      return `zoompan=z='1.3':x='iw-iw/zoom-if(eq(on,1),0,x-iw/zoom+2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=25`;
    case 'pan_right':
      return `zoompan=z='1.3':x='if(eq(on,1),0,x+2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=25`;
  }
}

export async function imageToKenBurnsVideo(
  imagePath: string,
  outputPath: string,
  duration: number,
  kenBurns: KenBurnsConfig
): Promise<void> {
  const filter = buildKenBurnsFilter(kenBurns.direction, duration);
  await runFFmpeg([
    '-loop', '1',
    '-i', imagePath,
    '-vf', filter,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-y',
    outputPath,
  ]);
}

export async function normalizeVideo(inputPath: string, outputPath: string): Promise<void> {
  await runFFmpeg([
    '-i', inputPath,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an', // strip audio from segments
    '-y',
    outputPath,
  ]);
}

export async function trimVideo(inputPath: string, outputPath: string, duration: number): Promise<void> {
  await runFFmpeg([
    '-i', inputPath,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-y',
    outputPath,
  ]);
}

export async function concatenateVideos(fileList: string[], outputPath: string): Promise<void> {
  // Write the concat file
  const concatContent = fileList.map((f) => `file '${f}'`).join('\n');
  const concatFile = path.join(path.dirname(outputPath), 'filelist.txt');
  fs.writeFileSync(concatFile, concatContent);

  await runFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    '-y',
    outputPath,
  ]);

  fs.unlinkSync(concatFile);
}

export async function overlayAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  await runFFmpeg([
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    '-y',
    outputPath,
  ]);
}

export async function crossfadeVideos(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  clip1Duration: number,
  fadeDuration: number = 0.5
): Promise<void> {
  const offset = clip1Duration - fadeDuration;
  await runFFmpeg([
    '-i', clip1Path,
    '-i', clip2Path,
    '-filter_complex',
    `xfade=transition=fade:duration=${fadeDuration}:offset=${offset}`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-y',
    outputPath,
  ]);
}

export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ]);

    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed with code ${code}`));
      try {
        const info = JSON.parse(stdout);
        resolve(parseFloat(info.format.duration));
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e}`));
      }
    });
    proc.on('error', reject);
  });
}

export async function getFileSize(filePath: string): Promise<number> {
  const stat = fs.statSync(filePath);
  return stat.size;
}

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'video-pipeline-'));
}

export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

/**
 * Full assembly pipeline: takes normalized segment videos + audio, applies transitions, merges.
 */
export async function assembleWithTransitions(
  segments: Array<{ path: string; duration: number; transition: string }>,
  audioPath: string,
  outputPath: string
): Promise<void> {
  const tempDir = path.dirname(outputPath);

  if (segments.length === 1) {
    // Single segment: just overlay audio
    await overlayAudio(segments[0].path, audioPath, outputPath);
    return;
  }

  // Build complex filter for xfade transitions
  // For simplicity, apply fade dissolve between adjacent clips using xfade filter chain
  const fadeDuration = 0.5;
  let filterParts: string[] = [];
  let inputs: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    inputs.push('-i', segments[i].path);
  }

  if (segments.every((s) => s.transition === 'cut' || s.transition === 'none')) {
    // Simple concat
    const mergedPath = path.join(tempDir, 'merged_video.mp4');
    await concatenateVideos(
      segments.map((s) => s.path),
      mergedPath
    );
    await overlayAudio(mergedPath, audioPath, outputPath);
    return;
  }

  // Mixed transitions: build xfade filter chain
  // ffmpeg -i v0 -i v1 -i v2 ... -filter_complex "[0][1]xfade=...:offset=d0-0.5[v01];[v01][2]xfade=...:offset=d0+d1-1[v012]" ...
  let cumulativeOffset = 0;
  let lastLabel = '[0:v]';

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const transition = segments[i].transition;
    const xfadeType = transition === 'dissolve' ? 'fade' : 'fade';
    const outLabel = i === segments.length - 1 ? '[vout]' : `[v${i}]`;

    cumulativeOffset += prev.duration - fadeDuration;
    filterParts.push(
      `${lastLabel}[${i}:v]xfade=transition=${xfadeType}:duration=${fadeDuration}:offset=${cumulativeOffset}${outLabel}`
    );
    lastLabel = outLabel;
  }

  const mergedPath = path.join(tempDir, 'merged_transitions.mp4');

  if (filterParts.length === 0) {
    await concatenateVideos(segments.map((s) => s.path), mergedPath);
  } else {
    await runFFmpeg([
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-y',
      mergedPath,
    ]);
  }

  await overlayAudio(mergedPath, audioPath, outputPath);
}
