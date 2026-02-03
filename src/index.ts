import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("AXIOM ENGINE ONLINE");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});