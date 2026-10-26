import express from "express";
import { ensureSchema } from "./db.js";
import { pullAll } from "./pull.js";
import { getStats, readFilters, searchRfqs } from "./search.js";
import { renderPage } from "./views.js";

const PORT = Number(process.env.PORT) || 8787;
const app = express();
let pulling = false;

// The whole UI: filters live in the URL, the server renders the table.
app.get("/", async (req, res, next) => {
  try {
    const filters = readFilters(req.query);
    const [stats, result] = await Promise.all([getStats(), searchRfqs(filters)]);
    res.send(renderPage(filters, stats, result, String(req.query.msg ?? "")));
  } catch (err) {
    next(err);
  }
});

// Same search as JSON.
app.get("/api/rfqs", async (req, res, next) => {
  try {
    res.json(await searchRfqs(readFilters(req.query)));
  } catch (err) {
    next(err);
  }
});

// "Refresh from DIBBS" button: download any new daily files.
app.post("/pull", async (_req, res) => {
  if (pulling) return res.redirect("/?msg=" + encodeURIComponent("A pull is already running."));
  pulling = true;
  try {
    const n = await pullAll();
    res.redirect("/?msg=" + encodeURIComponent(n ? `Imported ${n} new day(s) from DIBBS.` : "Already up to date."));
  } catch (err) {
    console.error(err);
    res.redirect("/?msg=" + encodeURIComponent("Pull failed: " + (err as Error).message));
  } finally {
    pulling = false;
  }
});

// Last resort for unexpected errors: log the details, show the user a plain message (no stack trace).
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Internal server error" });
  res.status(500).send(`<!doctype html><meta charset="utf-8"><title>Error</title>
    <body style="font:15px system-ui;padding:40px">
    <h1 style="font-size:20px">Something went wrong</h1>
    <p>The error has been logged. <a href="/">Back to the RFQ list</a></p></body>`);
});

await ensureSchema();
app.listen(PORT, "0.0.0.0", () => console.log(`http://localhost:${PORT}`));
