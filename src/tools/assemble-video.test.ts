/**
 * Test: assemble_video
 * Usage: npx tsx src/tools/assemble-video.test.ts
 *
 * Requires:
 * - CLOUDINARY_* vars set
 * - Sample image and audio URLs (uses public URLs for testing)
 */
import { assembleVideo } from './assemble-video.js';

// Public sample URLs for testing
const SAMPLE_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';
const SAMPLE_AUDIO_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

async function main() {
  console.log('Testing assemble_video...');
  console.log('Note: This test uses sample URLs and generates a real MP4 via FFmpeg.');

  try {
    const result = await assembleVideo({
      segments: [
        {
          segment_id: 1,
          asset_url: SAMPLE_IMAGE_URL,
          asset_type: 'image',
          duration: 5,
          start_time: 0,
          end_time: 5,
          transition_in: 'none',
          ken_burns: { enabled: true, direction: 'zoom_in' },
        },
        {
          segment_id: 2,
          asset_url: SAMPLE_IMAGE_URL,
          asset_type: 'image',
          duration: 5,
          start_time: 5,
          end_time: 10,
          transition_in: 'dissolve',
          ken_burns: { enabled: true, direction: 'pan_right' },
        },
      ],
      audio_url: SAMPLE_AUDIO_URL,
      output_format: 'mp4',
      resolution: '1920x1080',
    });

    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n✓ assemble_video passed');
  } catch (err) {
    console.error('\n✗ assemble_video failed:', err);
    process.exit(1);
  }
}

main();
