// Downloads new DIBBS daily index files and upserts them into Postgres.
// Usage: npm run pull           (only files not pulled yet)
//        npm run pull -- --all  (re-import everything listed on DIBBS)
import { pathToFileURL } from "node:url";
import { db, ensureSchema } from "./db.js";
import { getPage, listIndexFiles } from "./dibbs.js";
import { parseLine, postedDateFromFile, validateLine, type Rfq } from "./parse.js";

const COLUMNS: (keyof Rfq)[] = [
  "solicitation", "pr", "nsn", "fsc", "nomenclature", "qty", "unit", "return_by", "posted_date",
  "file_name", "buyer_code", "amsc", "item_type", "set_aside", "set_aside_pct", "sol_type",
];
const BATCH_SIZE = 1000; // 16 columns x 1000 rows stays well under Postgres' 65,535 parameter limit
const MAX_BAD_LINE_SHARE = 0.05; // more than 5% malformed lines = the format probably changed

async function upsertBatch(client: { query: typeof db.query }, rows: Rfq[]) {
  const params: unknown[] = [];
  const groups = rows.map((row) => {
    const placeholders = COLUMNS.map((col) => {
      params.push(row[col]);
      return "$" + params.length;
    });
    return `(${placeholders.join(", ")})`;
  });
  const updates = COLUMNS.slice(2).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  await client.query(
    `INSERT INTO rfqs (${COLUMNS.join(", ")}) VALUES ${groups.join(", ")}
     ON CONFLICT (solicitation, pr) DO UPDATE SET ${updates}`,
    params,
  );
}

export async function pullAll({ all = false, log = console.log } = {}) {
  await ensureSchema();
  const links = await listIndexFiles();
  if (links.length === 0) throw new Error("No index files found on the Recent RFQs page");
  const done = new Set((await db.query("SELECT file_name FROM pulled_files")).rows.map((r) => r.file_name));
  let imported = 0;

  for (const link of links) {
    const fileName = link.split("/").pop()!;
    if (!all && done.has(fileName)) continue;

    const { text } = await getPage(link);
    const postedDate = postedDateFromFile(fileName);
    // Dedupe by key: one INSERT can't touch the same (solicitation, pr) twice.
    const byKey = new Map<string, Rfq>();
    const bad: string[] = [];
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    for (const [i, line] of lines.entries()) {
      const problem = validateLine(line);
      if (problem) {
        bad.push(`line ${i + 1}: ${problem}`);
        continue;
      }
      const row = parseLine(line, postedDate);
      byKey.set(row.solicitation + "|" + row.pr, row);
    }
    const rows = [...byKey.values()];

    // Fail loudly if the format changed. Nothing is saved and the day is not marked as pulled,
    // so the next run tries again. A few odd lines are tolerated and reported.
    if (rows.length === 0 || bad.length > lines.length * MAX_BAD_LINE_SHARE) {
      throw new Error(
        `${fileName}: ${bad.length} of ${lines.length} lines don't match the DIBBS index format ` +
          `(first: ${bad[0] ?? "no lines"}). Did DIBBS change the file layout?`,
      );
    }
    if (bad.length) log(`${fileName}: skipped ${bad.length} malformed line(s), first: ${bad[0]}`);

    // One transaction per file: the day is imported completely or not at all.
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await upsertBatch(client, rows.slice(i, i + BATCH_SIZE));
      }
      await client.query(
        `INSERT INTO pulled_files (file_name, row_count) VALUES ($1, $2)
         ON CONFLICT (file_name) DO UPDATE SET row_count = EXCLUDED.row_count, pulled_at = now()`,
        [fileName, rows.length],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    log(`${fileName}: ${rows.length} rows`);
    imported++;
  }
  log(`Done. ${imported} new file(s), ${links.length - imported} already pulled.`);
  return imported;
}

// Run directly: npm run pull
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  pullAll({ all: process.argv.includes("--all") })
    .then(() => db.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
