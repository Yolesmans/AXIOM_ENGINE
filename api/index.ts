import type { VercelRequest, VercelResponse } from '@vercel/node';
// import { buildServer } from '../src/server.js'; // TEMPORAIREMENT COMMENTÉ

// TEMPORAIREMENT COMMENTÉ - buildServer
// const app = buildServer();
// let isReady = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // TEMPORAIREMENT COMMENTÉ - buildServer
  // if (!isReady) {
  //   await app.ready();
  //   isReady = true;
  // }
  // app.server.emit('request', req, res);
  res.status(200).json({ status: 'ok', service: 'AXIOM_ENGINE' });
}
