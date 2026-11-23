// server.js - a tiny zero-dependency static file server for local development.
// Why it exists: ES modules (<script type="module">) are blocked when index.html is opened by double-click
// (file://). Browsers only load modules over http(s). Run:  npm start   then open the address it prints.
// It is NOT a backend: StudentOS stores everything in the browser. This server only hands out the files.
// If the port is busy (for example an older copy is still running) it tries the next ports automatically.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const FIRST_PORT = Number(process.env.PORT) || 5173;
const MAX_TRIES = 10;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
};

async function handler(req, res) {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(join(ROOT, normalize(urlPath === '/' ? '/index.html' : urlPath)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; } // block ../ path traversal
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

function listen(port, attempt = 0) {
  const server = createServer(handler);
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_TRIES) {
      console.log(`Port ${port} is busy (an older StudentOS server may still be running). Trying ${port + 1}...`);
      listen(port + 1, attempt + 1);
    } else {
      console.error(`Could not start the server: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, () => console.log(`StudentOS running at http://localhost:${port}   (press Ctrl+C to stop)`));
}

listen(FIRST_PORT);
