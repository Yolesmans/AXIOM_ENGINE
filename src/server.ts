import express from "express";

console.log("BOOT SERVER START");

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).send();
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SERVER LISTENING ON ${PORT}`);
});
