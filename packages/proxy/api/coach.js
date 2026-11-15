// Vercel serverless function (Node runtime, Web Request/Response handlers).
// Deployed at /api/coach. All logic lives in ../lib/handler.js.
import { createHandler } from '../lib/handler.js';

const handle = createHandler({ env: process.env });

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
