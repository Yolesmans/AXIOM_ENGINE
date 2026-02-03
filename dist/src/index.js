import express from "express";
const app = express();
app.get("/", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "AXIOM_ENGINE",
        env: process.env.NODE_ENV || "production"
    });
});
app.get("/favicon.ico", (req, res) => {
    res.status(204).send();
});
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
});
