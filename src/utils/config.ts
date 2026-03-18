import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
  },
  kling: {
    apiKey: process.env.KLING_API_KEY || '',
  },
  veo3: {
    apiKey: process.env.VEO3_API_KEY || '',
    enabled: process.env.VEO3_ENABLED === 'true',
  },
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN || '',
  },
  banana: {
    apiKey: process.env.BANANA_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
};

export function validateConfig(): void {
  const required = [
    ['ANTHROPIC_API_KEY', config.anthropic.apiKey],
    ['ELEVENLABS_API_KEY', config.elevenlabs.apiKey],
    ['CLOUDINARY_CLOUD_NAME', config.cloudinary.cloudName],
    ['CLOUDINARY_API_KEY', config.cloudinary.apiKey],
    ['CLOUDINARY_API_SECRET', config.cloudinary.apiSecret],
  ];

  const missing = required.filter(([, val]) => !val).map(([key]) => key);
  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
  }
}
