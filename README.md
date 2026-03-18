# AI Video Pipeline MCP Server

An MCP (Model Context Protocol) server that powers an end-to-end AI video generation pipeline. Takes a plain narration script as input and produces a finished MP4 with AI-generated visuals and voiceover.

## Architecture

```
Script → ElevenLabs TTS → Claude scene decomposition → Asset generation (Kling/Veo3/FLUX/SDXL/DALL-E) → FFmpeg assembly → Final MP4
```

**Key design principles:**
- ElevenLabs reads the script verbatim — no AI rewording of the narration
- Claude acts as director — infers visuals from narration context
- Audio drives timing — video clip durations match spoken word timestamps
- Never halts — automatic fallback routing across all providers
- Black box to Make.com — single webhook call in, video URL out

## Tools

| Tool | Purpose |
|------|---------|
| `generate_voiceover` | ElevenLabs TTS with word-level timestamps |
| `decompose_script` | Claude-powered scene decomposition |
| `generate_asset` | Single asset generation with fallback routing |
| `check_job_status` | Poll async jobs (Kling, Veo3, SVD) |
| `assemble_video` | FFmpeg assembly of all segments + audio |
| `get_pipeline_status` | Check pipeline progress |
| `run_full_pipeline` | End-to-end orchestration (one call) |

## Fallback Chains

**Video:** `kling → veo3 → replicate_svd → flux+ken_burns`
**Image:** `flux → sdxl → dalle3`

## Setup

```bash
npm install
cp .env.example .env
# Fill in all API keys in .env
npm run build
npm start
```

## Environment Variables

```
ANTHROPIC_API_KEY=           # Claude API (scene decomposition)
ELEVENLABS_API_KEY=          # TTS
ELEVENLABS_VOICE_ID=         # Default ElevenLabs voice
KLING_API_KEY=               # Kling AI video generation
VEO3_API_KEY=                # Google Veo 3 (set VEO3_ENABLED=true)
REPLICATE_API_TOKEN=         # FLUX, SVD, SDXL
BANANA_API_KEY=              # Banana.dev SDXL (optional fallback)
OPENAI_API_KEY=              # DALL-E 3 fallback
CLOUDINARY_CLOUD_NAME=       # Asset storage
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

## Development

```bash
npm run dev              # Watch mode with tsx
npm run test:voiceover   # Test ElevenLabs integration
npm run test:decompose   # Test Claude decomposition (uses mock timestamps)
npm run test:asset       # Test asset generation (FLUX image)
npm run test:assemble    # Test FFmpeg assembly
npm run test:pipeline    # End-to-end test (requires all API keys)
```

## Deployment (Render.com)

1. Build command: `apt-get update && apt-get install -y ffmpeg && npm install && npm run build`
2. Start command: `npm start`
3. Add all environment variables from `.env.example`

## Project Structure

```
src/
├── index.ts                 # MCP server entry + tool registration
├── tools/                   # One file per MCP tool
│   ├── generate-voiceover.ts
│   ├── decompose-script.ts
│   ├── generate-asset.ts
│   ├── check-job-status.ts
│   ├── assemble-video.ts
│   ├── get-pipeline-status.ts
│   └── run-full-pipeline.ts
├── providers/               # External API clients
│   ├── elevenlabs.ts
│   ├── kling.ts
│   ├── veo3.ts
│   ├── replicate.ts
│   ├── banana.ts
│   ├── dalle.ts
│   └── cloudinary.ts
├── services/               # Internal business logic
│   ├── fallback-router.ts  # Provider fallback chain
│   ├── prompt-adapter.ts   # Per-provider prompt formatting
│   ├── ffmpeg.ts           # FFmpeg command builder
│   └── pipeline-state.ts  # In-memory pipeline tracking
└── utils/
    ├── config.ts
    └── types.ts
```
