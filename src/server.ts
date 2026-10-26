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

await ensureSchema();
app.listen(PORT, "0.0.0.0", () => console.log(`http://localhost:${PORT}`));
