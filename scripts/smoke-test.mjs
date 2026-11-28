import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import analyze from '../api/analyze.mjs';

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const photoPath = process.argv[2];
  if (!photoPath || !Object.hasOwn(mimeTypes, extname(photoPath).toLowerCase())) {
    throw new Error('Usage: node --env-file=.env scripts/smoke-test.mjs <photo.jpg|photo.png|photo.webp>');
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error('Set GEMINI_API_KEY in the server environment before running the smoke test.');
  }
  const photo = await stat(photoPath);
  if (!photo.isFile() || photo.size > 5_000_000) {
    throw new Error('Provide a photo file of 5 MB or less.');
  }

  const response = {
    statusCode: 200,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      return body;
    },
  };

  const result = await analyze({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      imageBase64: (await readFile(photoPath)).toString('base64'),
      mimeType: mimeTypes[extname(photoPath).toLowerCase()],
      style: 'Minimalist',
      budgetThb: 100,
      condition: 'Used',
    },
  }, response);

  console.log(JSON.stringify(result, null, 2));
  if (response.statusCode !== 200) {
    throw new Error('Analysis returned HTTP ' + response.statusCode);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
