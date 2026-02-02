import 'dotenv/config';
import { buildServer } from './server.js';
import { env } from './env.js';
const app = buildServer();
// 🔹 Mode local uniquement
if (process.env.NODE_ENV !== 'production') {
    app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
}
// 🔹 Export pour Vercel (serverless)
export default app;
