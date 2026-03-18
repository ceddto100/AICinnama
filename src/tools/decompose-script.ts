import { z } from 'zod/v3';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config.js';
import { ScriptSegment, WordTimestamp } from '../utils/types.js';

export const DecomposeScriptInputSchema = z.object({
  script: z.string().describe('The full narration text'),
  word_timestamps: z
    .array(z.object({ word: z.string(), start: z.number(), end: z.number() }))
    .describe('Word-level timestamps from generate_voiceover'),
  total_duration: z.number().describe('Total audio duration in seconds'),
  style_guidance: z
    .string()
    .optional()
    .describe("Optional style, e.g. 'documentary', 'cinematic thriller', 'corporate'"),
});

export type DecomposeScriptInput = z.infer<typeof DecomposeScriptInputSchema>;

const SYSTEM_PROMPT = `You are an expert film director and cinematographer. You will receive a narration script — plain spoken text with no stage directions or visual cues.

Your job is to break this narration into visual segments and imagine what should appear on screen for each one. Think about:
- What visual metaphor or literal scene best accompanies these words?
- What camera movement would feel right? (dolly in, tracking, static wide, handheld, aerial)
- What mood and color palette? (warm/cold, bright/moody, saturated/muted)
- Should this be video (motion needed) or a still image with slow pan/zoom (Ken Burns)?
- Which generation API would produce the best result for this specific scene?

Rules:
- Split at natural sentence boundaries. Target 5-15 second segments but be flexible.
- Each segment's duration MUST match the audio timing provided — use the word timestamps to calculate exact start/end times.
- Video generation prompts should be 30-60 words, highly specific, and include: shot type, camera movement, lighting, color grade, atmosphere, and quality keywords (4K, cinematic, film grain, etc.)
- Image prompts should emphasize composition, lighting, and photorealistic quality.
- For scenes with no inherent motion (contemplative moments, establishing contexts), prefer image + Ken Burns over video — it's cheaper and often looks better.
- NEVER include the narration text in the visual prompt. The visuals accompany the narration, they don't illustrate it literally.

API selection guidelines:
- "kling" — Best for: human motion, action, complex movement, character-driven scenes. Supports 5-10s clips.
- "veo3" — Best for: cinematic wide shots, nature, environments, atmospheric footage. High quality but slower.
- "replicate_svd" — Best for: subtle motion from a still (water, clouds, hair). Good for extending image to video.
- "flux" — Best for: photorealistic stills, portraits, architectural shots, product shots. Use with Ken Burns for video-length output.
- "sdxl" — Fallback image model. Good quality, fast, cheap.
- "dalle3" — Last resort image fallback. Reliable but more illustrative style.

Respond ONLY with a JSON array. No preamble, no markdown backticks, no explanation.

Each element:
{
  "segment_id": number (sequential starting at 1),
  "narration_text": "exact text from script for this segment",
  "start_time": number (seconds, from audio timestamps),
  "end_time": number (seconds, from audio timestamps),
  "duration": number (seconds),
  "asset_type": "video" | "image",
  "visual_prompt": "detailed generation prompt",
  "camera_style": "wide | close-up | medium | tracking | dolly | aerial | static | handheld",
  "mood": "string describing mood/atmosphere",
  "transition_in": "cut | fade | dissolve | none",
  "recommended_api": "kling | veo3 | replicate_svd | flux | sdxl",
  "ken_burns": { "enabled": boolean, "direction": "zoom_in | zoom_out | pan_left | pan_right" }
}`;

export async function decomposeScript(input: DecomposeScriptInput): Promise<ScriptSegment[]> {
  const { script, word_timestamps, total_duration, style_guidance } = input;

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const userContent = `Narration script:
"${script}"

Total audio duration: ${total_duration.toFixed(2)} seconds
Style guidance: ${style_guidance || 'cinematic, professional'}

Word timestamps (first word → last):
${word_timestamps
  .map((w) => `"${w.word}" [${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s]`)
  .join(', ')}

Break this script into visual segments. Each segment's start_time and end_time must match the actual audio timing.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('');

  // Strip any accidental markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let segments: ScriptSegment[];
  try {
    segments = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e}\nRaw: ${cleaned.slice(0, 500)}`);
  }

  // Validate and fix segment timing
  return segments.map((seg, i) => ({
    ...seg,
    segment_id: i + 1,
    duration: Number((seg.end_time - seg.start_time).toFixed(3)),
  }));
}
