/**
 * Test: decompose_script
 * Usage: npx tsx src/tools/decompose-script.test.ts
 * Uses mock audio timestamps to test Claude decomposition without ElevenLabs.
 */
import { decomposeScript } from './decompose-script.js';

const MOCK_SCRIPT =
  'Every empire begins with a single bold decision. The founders of Rome did not build their city in a day. They laid one stone, made one alliance, won one battle at a time. That is how lasting things are built.';

const MOCK_TIMESTAMPS = [
  { word: 'Every', start: 0.0, end: 0.3 },
  { word: 'empire', start: 0.3, end: 0.7 },
  { word: 'begins', start: 0.7, end: 1.1 },
  { word: 'with', start: 1.1, end: 1.3 },
  { word: 'a', start: 1.3, end: 1.4 },
  { word: 'single', start: 1.4, end: 1.8 },
  { word: 'bold', start: 1.8, end: 2.1 },
  { word: 'decision.', start: 2.1, end: 2.7 },
  { word: 'The', start: 3.0, end: 3.2 },
  { word: 'founders', start: 3.2, end: 3.7 },
  { word: 'of', start: 3.7, end: 3.9 },
  { word: 'Rome', start: 3.9, end: 4.3 },
  { word: 'did', start: 4.3, end: 4.5 },
  { word: 'not', start: 4.5, end: 4.7 },
  { word: 'build', start: 4.7, end: 5.0 },
  { word: 'their', start: 5.0, end: 5.2 },
  { word: 'city', start: 5.2, end: 5.5 },
  { word: 'in', start: 5.5, end: 5.7 },
  { word: 'a', start: 5.7, end: 5.8 },
  { word: 'day.', start: 5.8, end: 6.4 },
  { word: 'They', start: 6.8, end: 7.0 },
  { word: 'laid', start: 7.0, end: 7.3 },
  { word: 'one', start: 7.3, end: 7.5 },
  { word: 'stone,', start: 7.5, end: 7.9 },
  { word: 'made', start: 8.1, end: 8.4 },
  { word: 'one', start: 8.4, end: 8.6 },
  { word: 'alliance,', start: 8.6, end: 9.2 },
  { word: 'won', start: 9.4, end: 9.6 },
  { word: 'one', start: 9.6, end: 9.8 },
  { word: 'battle', start: 9.8, end: 10.2 },
  { word: 'at', start: 10.2, end: 10.4 },
  { word: 'a', start: 10.4, end: 10.5 },
  { word: 'time.', start: 10.5, end: 11.0 },
  { word: 'That', start: 11.5, end: 11.8 },
  { word: 'is', start: 11.8, end: 12.0 },
  { word: 'how', start: 12.0, end: 12.2 },
  { word: 'lasting', start: 12.2, end: 12.6 },
  { word: 'things', start: 12.6, end: 12.9 },
  { word: 'are', start: 12.9, end: 13.1 },
  { word: 'built.', start: 13.1, end: 13.6 },
];

async function main() {
  console.log('Testing decompose_script with mock timestamps...');

  try {
    const result = await decomposeScript({
      script: MOCK_SCRIPT,
      word_timestamps: MOCK_TIMESTAMPS,
      total_duration: 13.6,
      style_guidance: 'cinematic historical documentary',
    });

    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n✓ decompose_script passed — ${result.length} segments generated`);
  } catch (err) {
    console.error('\n✗ decompose_script failed:', err);
    process.exit(1);
  }
}

main();
