import { z } from 'zod';
import * as elevenlabs from '../providers/elevenlabs.js';
import * as cloudinary from '../providers/cloudinary.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const GenerateVoiceoverInputSchema = z.object({
  script: z.string().describe('The full narration text, verbatim'),
  voice_id: z.string().optional().describe('Optional ElevenLabs voice ID override'),
  model_id: z.string().optional().default('eleven_multilingual_v2').describe('ElevenLabs model ID'),
});

export type GenerateVoiceoverInput = z.infer<typeof GenerateVoiceoverInputSchema>;

export interface GenerateVoiceoverOutput {
  audio_url: string;
  duration_seconds: number;
  word_timestamps: Array<{ word: string; start: number; end: number }>;
}

export async function generateVoiceover(
  input: GenerateVoiceoverInput
): Promise<GenerateVoiceoverOutput> {
  const { script, voice_id, model_id } = input;

  // Generate speech with word-level timestamps — exact text, no modifications
  const { audioBuffer, wordTimestamps, durationSeconds } = await elevenlabs.generateSpeechWithTimestamps(
    script,
    voice_id,
    model_id || 'eleven_multilingual_v2'
  );

  // Save to temp file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceover-'));
  const audioPath = path.join(tempDir, 'voiceover.mp3');
  fs.writeFileSync(audioPath, audioBuffer);

  // Upload to Cloudinary
  const audioUrl = await cloudinary.uploadFile(audioPath, 'video-pipeline/audio', 'raw');

  // Cleanup
  fs.unlinkSync(audioPath);
  fs.rmdirSync(tempDir);

  return {
    audio_url: audioUrl,
    duration_seconds: durationSeconds,
    word_timestamps: wordTimestamps,
  };
}
