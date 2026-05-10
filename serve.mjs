import { createServer } from 'http';
import { readFile, readFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

// Parse .env (no external deps needed)
const env = {};
try {
  const lines = readFileSync(join(ROOT, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
} catch {}

const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const PORT = parseInt(env.PORT || process.env.PORT || '3333');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function readBody(req) {
  return new Promise((res, rej) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => res(body));
    req.on('error', rej);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ── GET /api/config ──
  if (req.method === 'GET' && url === '/api/config') {
    return json(res, { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
  }

  // ── POST /api/identify ── (Anthropic Vision proxy)
  if (req.method === 'POST' && url === '/api/identify') {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = JSON.parse(await readBody(req));
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              { type: 'text', text: `You are a fish identification expert. Identify the fish in this image. Respond with ONLY valid JSON and no markdown or explanation:
{"species":"Common Name","confidence":95,"habitat":"One to two sentence habitat tip.","regulations":"Brief California fishing regulation for this species.","lures":["Lure 1","Lure 2","Lure 3"],"legal":true}` }
            ]
          }]
        })
      });
      const data = await r.json();
      const text = (data.content?.[0]?.text || '{}').trim();
      const match = text.match(/\{[\s\S]*\}/);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(match ? match[0] : text);
    } catch (err) {
      json(res, { error: err.message }, 500);
    }
    return;
  }

  // ── POST /api/name-spot ── (Anthropic text proxy)
  if (req.method === 'POST' && url === '/api/name-spot') {
    try {
      const { lat, lng } = JSON.parse(await readBody(req));
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{
            role: 'user',
            content: `A fisherman is at latitude ${lat}, longitude ${lng}. Give me ONLY a short fishing spot name (like "Santa Monica Pier" or "Lake Elsinore South Cove"). Just the name, nothing else.`
          }]
        })
      });
      const data = await r.json();
      const name = (data.content?.[0]?.text || 'Unknown Spot').trim().replace(/^["']|["']$/g, '');
      return json(res, { name });
    } catch {
      return json(res, { name: 'Unknown Spot' });
    }
  }

  // ── Static files ──
  const filePath = resolve(join(ROOT, url === '/' ? 'index.html' : url));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
    const ct = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Fishy AI → http://localhost:${PORT}`));
