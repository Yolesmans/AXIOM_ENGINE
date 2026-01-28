# axiom-engine

Backend minimal (TypeScript + Fastify) pour exécuter AXIOM côté serveur.

## Dev
- Copier `.env.example` en `.env` et renseigner `OPENAI_API_KEY`
- Lancer :
  - `pnpm dev`

## Endpoints
- `GET /health` -> `{ ok: true }`
- `POST /axiom` (stub) -> renvoie `ENGINE_NOT_IMPLEMENTED_YET`
