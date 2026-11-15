// Local stand-in for Vercel: serves lib/handler.js on http://127.0.0.1:8787/api/coach.
// The key comes from the environment only (source your .env in a subshell; never pass it on the command line).
//   (set -a; . /path/to/.env; set +a; ALLOWED_ORIGINS=https://localhost:8081 node dev-server.mjs)
import { createServer } from 'node:http';
import { createHandler } from './lib/handler.js';

const port = Number(process.env.PORT ?? 8787);
const handle = createHandler({ env: { ALLOWED_ORIGINS: 'https://localhost:8081', ALLOW_NO_ORIGIN: '1', ...process.env } });

createServer(async (req, res) => {
  if (!req.url?.startsWith('/api/coach')) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  const r = await handle(request);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`mebae coach proxy on http://127.0.0.1:${port}/api/coach (key ${process.env.MODEL_API_KEY ? 'set' : 'NOT set: setup_required'})`));
