import 'dotenv/config';
import { buildServer } from './server.js';
import { env } from './env.js';

const app = buildServer();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error(err);
  process.exit(1);
});

// 🔹 Export pour Vercel (serverless)
export default app;