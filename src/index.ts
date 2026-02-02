import 'dotenv/config';
import { buildServer } from './server.js';

const app = buildServer();

const PORT = process.env.PORT || 3000;

app.listen({ port: Number(PORT), host: '0.0.0.0' }, () => {
  console.log(`Server listening on port ${PORT}`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

// 🔹 Export pour Vercel (serverless)
export default app;