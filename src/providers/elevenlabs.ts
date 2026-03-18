import axios from 'axios';
import { config } from '../utils/config.js';
import { WordTimestamp } from '../utils/types.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsResponse {
  audioBuffer: Buffer;
  wordTimestamps: WordTimestamp[];
  durationSeconds: number;
}

export async function generateSpeechWithTimestamps(
  text: string,
  voiceId?: string,
  modelId: string = 'eleven_multilingual_v2'
): Promise<ElevenLabsResponse> {
  const vid = voiceId || config.elevenlabs.voiceId;

  const response = await axios.post(
    `${BASE_URL}/text-to-speech/${vid}/with-timestamps`,
    {
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        'xi-api-key': config.elevenlabs.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      responseType: 'json',
    }
  );

  const data = response.data;

  // ElevenLabs returns base64-encoded audio + alignment data
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');

  // Parse character-level alignment into word-level timestamps
  const wordTimestamps = parseAlignment(data.alignment || data.normalized_alignment);

  const durationSeconds =
    wordTimestamps.length > 0
      ? wordTimestamps[wordTimestamps.length - 1].end
      : 0;

  return { audioBuffer, wordTimestamps, durationSeconds };
}

function parseAlignment(alignment: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
  words?: string[];
  word_start_times_seconds?: number[];
  word_end_times_seconds?: number[];
} | null): WordTimestamp[] {
  if (!alignment) return [];

  // If word-level data is available directly
  if (alignment.words && alignment.word_start_times_seconds && alignment.word_end_times_seconds) {
    return alignment.words.map((word, i) => ({
      word,
      start: alignment.word_start_times_seconds![i],
      end: alignment.word_end_times_seconds![i],
    }));
  }

  // Otherwise aggregate character-level data into words
  if (!alignment.characters || !alignment.character_start_times_seconds || !alignment.character_end_times_seconds) {
    return [];
  }

  const words: WordTimestamp[] = [];
  let currentWord = '';
  let wordStart = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const charStart = alignment.character_start_times_seconds[i];
    const charEnd = alignment.character_end_times_seconds[i];

    if (char === ' ' || char === '\n') {
      if (currentWord.trim()) {
        words.push({ word: currentWord.trim(), start: wordStart, end: charStart });
        currentWord = '';
      }
    } else {
      if (!currentWord) wordStart = charStart;
      currentWord += char;
    }

    if (i === alignment.characters.length - 1 && currentWord.trim()) {
      words.push({ word: currentWord.trim(), start: wordStart, end: charEnd });
    }
  }

  return words;
}
