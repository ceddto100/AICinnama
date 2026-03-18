import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { validateConfig } from './utils/config.js';

// Tool implementations
import { generateVoiceover, GenerateVoiceoverInputSchema } from './tools/generate-voiceover.js';
import { decomposeScript, DecomposeScriptInputSchema } from './tools/decompose-script.js';
import { generateAsset, GenerateAssetInputSchema } from './tools/generate-asset.js';
import { checkJobStatus, CheckJobStatusInputSchema } from './tools/check-job-status.js';
import { assembleVideo, AssembleVideoInputSchema } from './tools/assemble-video.js';
import { getPipelineStatus, GetPipelineStatusInputSchema } from './tools/get-pipeline-status.js';
import { runFullPipeline, RunFullPipelineInputSchema } from './tools/run-full-pipeline.js';

validateConfig();

const server = new McpServer({
  name: 'video-pipeline',
  version: '1.0.0',
});

// ── Tool 1: generate_voiceover ─────────────────────────────────────────────
server.tool(
  'generate_voiceover',
  'Generate a voiceover from a narration script using ElevenLabs. Returns audio URL and word-level timestamps.',
  GenerateVoiceoverInputSchema.shape,
  async (input) => {
    const result = await generateVoiceover(input as z.infer<typeof GenerateVoiceoverInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 2: decompose_script ───────────────────────────────────────────────
server.tool(
  'decompose_script',
  'Decompose a narration script into visual segments using Claude. Returns scene descriptions, visual prompts, timing, and recommended generation APIs.',
  DecomposeScriptInputSchema.shape,
  async (input) => {
    const result = await decomposeScript(input as z.infer<typeof DecomposeScriptInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 3: generate_asset ────────────────────────────────────────────────
server.tool(
  'generate_asset',
  'Generate a single video clip or image for a segment with automatic fallback routing across providers.',
  GenerateAssetInputSchema.shape,
  async (input) => {
    const result = await generateAsset(input as z.infer<typeof GenerateAssetInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 4: check_job_status ──────────────────────────────────────────────
server.tool(
  'check_job_status',
  'Poll an async video generation job (Kling, Veo3, Replicate SVD) for completion status.',
  CheckJobStatusInputSchema.shape,
  async (input) => {
    const result = await checkJobStatus(input as z.infer<typeof CheckJobStatusInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 5: assemble_video ────────────────────────────────────────────────
server.tool(
  'assemble_video',
  'Assemble all generated segment assets and voiceover into a final MP4 using FFmpeg.',
  AssembleVideoInputSchema.shape,
  async (input) => {
    const result = await assembleVideo(input as z.infer<typeof AssembleVideoInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 6: get_pipeline_status ───────────────────────────────────────────
server.tool(
  'get_pipeline_status',
  'Get the current state of a pipeline run — segments done, pending, errors.',
  GetPipelineStatusInputSchema.shape,
  async (input) => {
    const result = getPipelineStatus(input as z.infer<typeof GetPipelineStatusInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 7: run_full_pipeline ────────────────────────────────────────────
server.tool(
  'run_full_pipeline',
  'Run the entire AI video generation pipeline end-to-end: voiceover → scene decomposition → asset generation → assembly. Single call in, final MP4 URL out.',
  RunFullPipelineInputSchema.shape,
  async (input) => {
    const result = await runFullPipeline(input as z.infer<typeof RunFullPipelineInputSchema>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Start server ──────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Video Pipeline MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
