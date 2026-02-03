import express, { type Express } from "express";

export const sessions = new Map<string, unknown>();

export function buildServer(): Express {
  const app = express();

  app.get("/", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "AXIOM_ENGINE",
      runtime: "railway",
      env: process.env.NODE_ENV || "production",
    });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).send();
  });

  return app;
}

async function main() {
  const app = buildServer();
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`[railway] listening on 0.0.0.0:${PORT}`);

    // Lazy-load core AFTER HTTP is live (avoid Railway timeouts)
    try {
      await import("./index");
      console.log("[railway] core loaded via ./index");
    } catch (e1) {
      console.error("[railway] core load failed (server kept alive)", e1);
    }
  });
}

// ES modules entry point
main().catch((err) => {
  console.error("[railway] main failed", err);
  process.exit(1);
});
