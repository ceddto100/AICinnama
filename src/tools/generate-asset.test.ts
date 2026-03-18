/**
 * Test: generate_asset
 * Usage: npx tsx src/tools/generate-asset.test.ts
 * Tests image generation with FLUX (sync, no polling needed).
 */
import { generateAsset } from './generate-asset.js';

async function main() {
  console.log('Testing generate_asset (FLUX image)...');

  try {
    const result = await generateAsset({
      segment_id: 1,
      visual_prompt:
        'Ancient Roman forum at golden hour, wide establishing shot, warm amber light casting long shadows on marble columns, cinematic, 4K',
      asset_type: 'image',
      duration: 6.0,
      recommended_api: 'flux',
      ken_burns: { enabled: true, direction: 'zoom_in' },
    });

    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'complete' || result.status === 'processing') {
      console.log('\n✓ generate_asset passed');
    } else {
      console.error('\n✗ generate_asset returned failed status');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n✗ generate_asset failed:', err);
    process.exit(1);
  }
}

main();
