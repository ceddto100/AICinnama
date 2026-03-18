/**
 * Test: run_full_pipeline
 * Usage: npx tsx src/tools/run-full-pipeline.test.ts
 * End-to-end test — requires all API keys.
 */
import { runFullPipeline } from './run-full-pipeline.js';

const TEST_SCRIPT =
  'Every empire begins with a single bold decision. The founders of Rome did not build their city in a day. They laid one stone, made one alliance, won one battle at a time. That is how lasting things are built.';

async function main() {
  console.log('Testing run_full_pipeline (end-to-end)...');
  console.log('This requires all API keys and may take several minutes.\n');

  try {
    const result = await runFullPipeline({
      script: TEST_SCRIPT,
      style: 'cinematic historical documentary',
      resolution: '1920x1080',
    });

    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n✓ run_full_pipeline passed');
  } catch (err) {
    console.error('\n✗ run_full_pipeline failed:', err);
    process.exit(1);
  }
}

main();
