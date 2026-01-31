import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildServer } from '../src/server.js';

const app = buildServer();
let isReady = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isReady) {
    await app.ready();
    isReady = true;
  }
  app.server.emit('request', req, res);
}
