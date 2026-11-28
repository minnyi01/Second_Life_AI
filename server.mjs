import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import analyze from './api/analyze.mjs';
import generateImage from './api/generate-image.mjs';

const publicDirectory = resolve('public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function responseAdapter(response) {
  return {
    setHeader(name, value) {
      response.setHeader(name, value);
    },
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(body));
    },
  };
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4_500_000) request.destroy();
    });
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  const handler = url.pathname === '/api/analyze'
    ? analyze
    : url.pathname === '/api/generate-image'
      ? generateImage
      : null;

  if (handler) {
    let body;
    try {
      body = await readJson(request);
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON request.' } }));
      return;
    }

    await handler(
      { method: request.method, headers: request.headers, body },
      responseAdapter(response),
    );
    return;
  }

  const requestedPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = resolve(publicDirectory, requestedPath);
  if (relative(publicDirectory, filePath).startsWith('..')) {
    response.writeHead(404).end();
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, () => {
  console.log(`SecondLife AI is running at http://localhost:${port}`);
});
