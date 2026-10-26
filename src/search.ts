// Turns URL query params into one parameterized SQL query.
import { db } from "./db.js";

export const PAGE_SIZE = 50;

// ORDER BY always comes from this map, never from user text.
export const SORTS: Record<string, { label: string; sql: string }> = {
  deadline: { label: "Deadline (soonest)", sql: "return_by ASC, solicitation" },
  posted: { label: "Newest posted", sql: "posted_date DESC, solicitation" },
  qty_desc: { label: "Quantity (high → low)", sql: "qty DESC, return_by" },
  qty_asc: { label: "Quantity (low → high)", sql: "qty ASC, return_by" },
};

export type Filters = {
  q: string;
  status: string; // open | closed | all
  closing: string; // days
  set_aside: string[];
  fsc: string;
  posted: string;
  min_qty: string;
  sol_type: string;
  sort: string;
  page: number;
};

type Query = Record<string, unknown>;
const one = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "").trim();
const many = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
const isInt = (s: string) => /^\d{1,6}$/.test(s);
// "2026-10-23" yes; "2026-99-99" no (Postgres would reject it with an error).
const isDate = (s: string) =>
  /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
// Make % and _ match literally in ILIKE (backslash is Postgres' default LIKE escape).
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export function readFilters(query: Query): Filters {
  // At most 6 digits: a huge number would become e.g. 5e+22, which Postgres rejects as an OFFSET.
  const page = isInt(one(query.page)) ? parseInt(one(query.page), 10) : 1;
  return {
    q: one(query.q),
    status: ["open", "closed", "all"].includes(one(query.status)) ? one(query.status) : "open",
    closing: one(query.closing),
    set_aside: many(query.set_aside),
    fsc: one(query.fsc),
    posted: one(query.posted),
    min_qty: one(query.min_qty),
    sol_type: one(query.sol_type),
    sort: SORTS[one(query.sort)] ? one(query.sort) : "deadline",
    page: page > 0 ? page : 1,
  };
}

// Builds the SQL text and its parameters. Pure (no DB), so it can be unit-tested.
export function buildSearchQuery(f: Filters): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll("?", "$" + params.length));
  };

  if (f.q) {
    // Users paste codes with dashes (SPE1C1-27-Q-0101, 8345-00-151-6486); the DB stores them without.
    const code = f.q.replace(/[-\s]/g, "");
    params.push("%" + escapeLike(code) + "%");
    const codeParam = "$" + params.length;
    add(
      `(solicitation ILIKE ${codeParam} OR nsn ILIKE ${codeParam} OR pr ILIKE ${codeParam} OR nomenclature ILIKE ?)`,
      "%" + escapeLike(f.q) + "%",
    );
  }
  if (f.status === "open") where.push("return_by >= CURRENT_DATE");
  if (f.status === "closed") where.push("return_by < CURRENT_DATE");
  if (isInt(f.closing)) add("return_by <= CURRENT_DATE + ?::int", f.closing);
  if (f.set_aside.length) add("set_aside = ANY(?)", f.set_aside);
  const fscs = f.fsc.split(/[\s,]+/).filter((s) => /^\d{4}$/.test(s));
  if (fscs.length) add("fsc = ANY(?)", fscs);
  if (isDate(f.posted)) add("posted_date = ?", f.posted);
  if (isInt(f.min_qty)) add("qty >= ?::int", f.min_qty);
  if (f.sol_type) add("sol_type = ?", f.sol_type);

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  params.push(PAGE_SIZE, (f.page - 1) * PAGE_SIZE);
  const sql = `SELECT *, return_by - CURRENT_DATE AS days_left, count(*) OVER() AS total
     FROM rfqs ${whereSql}
     ORDER BY ${SORTS[f.sort].sql}
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  return { sql, params };
}

export async function searchRfqs(f: Filters) {
  const { sql, params } = buildSearchQuery(f);
  const { rows } = await db.query(sql, params);
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

// Numbers for the header and the filter options.
export async function getStats() {
  const [totals, setAsides, days] = await Promise.all([
    db.query(`SELECT count(*) AS total,
                     count(*) FILTER (WHERE return_by >= CURRENT_DATE) AS open,
                     (SELECT max(pulled_at) FROM pulled_files) AS last_pull
              FROM rfqs`),
    db.query(`SELECT set_aside, count(*) AS n FROM rfqs WHERE return_by >= CURRENT_DATE
              GROUP BY set_aside ORDER BY n DESC`),
    db.query(`SELECT posted_date, count(*) AS n FROM rfqs GROUP BY posted_date ORDER BY posted_date DESC`),
  ]);
  return {
    total: Number(totals.rows[0].total),
    open: Number(totals.rows[0].open),
    lastPull: totals.rows[0].last_pull as Date | null,
    setAsides: setAsides.rows.map((r) => ({ code: r.set_aside as string, n: Number(r.n) })),
    days: days.rows.map((r) => ({ date: r.posted_date as string, n: Number(r.n) })),
  };
}
