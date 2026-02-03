import express from "express";
const app = express();
// ROUTES IMMÉDIATES (Railway healthcheck)
app.get("/", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "AXIOM_ENGINE",
        runtime: "railway",
    });
});
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
});
app.get("/favicon.ico", (_req, res) => {
    res.status(204).send();
});
// DÉMARRAGE SERVEUR — AUCUNE LOGIQUE AVANT
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", async () => {
    console.log(`AXIOM ENGINE listening on port ${PORT}`);
    // IMPORT LENT APRÈS BOOT HTTP
    try {
        await import("./index"); // ton ancien point d'entrée
        console.log("AXIOM core loaded");
    }
    catch (err) {
        console.error("AXIOM core failed to load", err);
    }
});
