/**
 * Test: generate_voiceover
 * Usage: npx tsx src/tools/generate-voiceover.test.ts "Your narration text here"
 */
import { generateVoiceover } from './generate-voiceover.js';

async function main() {
  const script = process.argv[2] || 'Every empire begins with a single bold decision.';

  console.log('Testing generate_voiceover...');
  console.log(`Script: "${script}"`);

  try {
    const result = await generateVoiceover({ script });
    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n✓ generate_voiceover passed');
  } catch (err) {
    console.error('\n✗ generate_voiceover failed:', err);
    process.exit(1);
  }
}

main();
