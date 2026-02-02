import { buildServer } from '../src/server.js';
const app = buildServer();
let isReady = false;
export default async function handler(req, res) {
    if (!isReady) {
        await app.ready();
        isReady = true;
    }
    app.server.emit('request', req, res);
}
