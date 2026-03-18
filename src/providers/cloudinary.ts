import { v2 as cloudinary } from 'cloudinary';
import { config } from '../utils/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export async function uploadFile(
  filePath: string,
  folder: string = 'video-pipeline',
  resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto'
): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: resourceType,
  });
  return result.secure_url;
}

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  folder: string = 'video-pipeline',
  resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, public_id: filename },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve(result.secure_url);
        else reject(new Error('No result from Cloudinary'));
      }
    );
    uploadStream.end(buffer);
  });
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect with no location header'));
          return;
        }
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => {
        fs.unlink(destPath, () => reject(err));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

export async function uploadUrl(
  url: string,
  folder: string = 'video-pipeline',
  resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto'
): Promise<string> {
  const result = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: resourceType,
  });
  return result.secure_url;
}
