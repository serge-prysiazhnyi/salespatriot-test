// Server-rendered HTML. Every value from the DB goes through esc().
import { PAGE_SIZE, SORTS, type Filters, type getStats } from "./search.js";

type Stats = Awaited<ReturnType<typeof getStats>>;

export const SET_ASIDES: Record<string, string> = {
  N: "Unrestricted",
  Y: "Small Business",
  H: "HUBZone",
  R: "SDVOSB",
  L: "WOSB",
  A: "8(a)",
  E: "EDWOSB",
};
const SOL_TYPES: Record<string, string> = { T: "T – automated", Q: "Q – manual", U: "U" };

export function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const u = encodeURIComponent;
const DIBBS = "https://www.dibbs.bsm.dla.mil";
export const links = {
  packageView: (sol: string) => `${DIBBS}/rfq/rfqrec.aspx?sn=${u(sol)}`,
  nsnHistory: (nsn: string) => `${DIBBS}/RFQ/RFQNsn.aspx?value=${u(nsn)}&category=post&Scope=`,
  pdf: (sol: string, file: string) =>
    `https://dibbs2.bsm.dla.mil/Downloads/RFQ/${u(sol.slice(-1))}/${u(file.replace(/\.pdf$/i, ".PDF"))}`,
};

// SPE1C127Q0101 -> SPE1C1-27-Q-0101, 8345001516486 -> 8345-00-151-6486
const fmtSol = (s: string) => (s.length === 13 ? `${s.slice(0, 6)}-${s.slice(6, 8)}-${s.slice(8, 9)}-${s.slice(9)}` : s);
const fmtNsn = (s: string) => (/^\d{13}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 9)}-${s.slice(9)}` : s);
// 2026-10-30 -> 10/30/2026 (same format as DIBBS)
const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

// Builds a "?a=b" link from the current filters with some values changed.
function href(f: Filters, change: Partial<Record<keyof Filters, string | string[] | number>>) {
  const p = new URLSearchParams();
  const merged = { ...f, page: 1, ...change } as Record<string, unknown>;
  for (const [k, v] of Object.entries(merged)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item !== "" && item !== undefined && !(k === "page" && item === 1)) p.append(k, String(item));
    }
  }
  return "?" + p.toString();
}

function option(value: string, label: string, selected: string) {
  return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
}

function deadline(daysLeft: number) {
  if (daysLeft < 0) return `<span class="muted">closed</span>`;
  const cls = daysLeft < 3 ? "red" : daysLeft < 7 ? "amber" : "";
  return `<span class="${cls}">${daysLeft === 0 ? "today" : `in ${daysLeft} d`}</span>`;
}

function row(r: any, f: Filters) {
  const fscLink = r.fsc
    ? `<a class="muted" href="${esc(href(f, { fsc: r.fsc }))}" title="Show only FSC ${esc(r.fsc)}">FSC ${esc(r.fsc)}</a>`
    : `<span class="muted">part #</span>`;
  return `<tr>
    <td><a href="${esc(links.packageView(r.solicitation))}" target="_blank" rel="noopener">${esc(fmtSol(r.solicitation))}</a>
        <div class="muted">PR ${esc(r.pr)} · ${esc(r.sol_type)}</div></td>
    <td><a href="${esc(links.nsnHistory(r.nsn))}" target="_blank" rel="noopener" title="All DIBBS RFQs for this NSN">${esc(fmtNsn(r.nsn))}</a>
        <div>${fscLink}</div></td>
    <td>${esc(r.nomenclature)}</td>
    <td class="num">${esc(r.qty.toLocaleString("en-US"))} <span class="muted">${esc(r.unit)}</span></td>
    <td><span class="badge sa-${esc(r.set_aside)}">${esc(SET_ASIDES[r.set_aside] ?? r.set_aside)}</span></td>
    <td>${esc(fmtDate(r.posted_date))}</td>
    <td>${esc(fmtDate(r.return_by))}<div>${deadline(r.days_left)}</div></td>
    <td><a href="${esc(links.pdf(r.solicitation, r.file_name))}" target="_blank" rel="noopener">PDF</a></td>
  </tr>`;
}

export function renderPage(f: Filters, stats: Stats, result: { rows: any[]; total: number }, flash = "") {
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const lastPull = stats.lastPull ? new Date(stats.lastPull).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "never";

  const setAsideBoxes = stats.setAsides
    .map(({ code, n }) => `<label class="pill"><input type="checkbox" name="set_aside" value="${esc(code)}"${f.set_aside.includes(code) ? " checked" : ""}>
        ${esc(SET_ASIDES[code] ?? code)} <span class="muted">${n.toLocaleString("en-US")}</span></label>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIBBS RFQ Browser</title>
<style>
  :root { --fg:#1d2330; --muted:#6b7280; --line:#e5e7eb; --bg:#f7f8fa; --accent:#1f5fbf; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; color:var(--fg); background:var(--bg); }
  header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px 20px; background:#14213d; color:#fff; flex-wrap:wrap; }
  header h1 { font-size:18px; margin:0; } header .meta { opacity:.85; font-size:13px; }
  header button { background:#fff; color:#14213d; border:0; border-radius:6px; padding:6px 12px; font-weight:600; cursor:pointer; }
  form.filters { display:flex; flex-wrap:wrap; gap:10px 14px; align-items:end; padding:12px 20px; background:#fff; border-bottom:1px solid var(--line); }
  form.filters label.field { display:flex; flex-direction:column; font-size:12px; color:var(--muted); gap:3px; }
  input, select { font:inherit; padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }
  input[name=q] { width:280px; } input[name=fsc] { width:110px; } input[name=min_qty] { width:80px; }
  .pills { display:flex; flex-wrap:wrap; gap:6px; width:100%; align-items:center; }
  .pills > b { font-size:12px; color:var(--muted); font-weight:500; margin-right:4px; }
  .pill { border:1px solid #cbd5e1; border-radius:999px; padding:3px 10px; cursor:pointer; background:#fff; user-select:none; }
  .pill:has(input:checked) { background:#e8f0fe; border-color:var(--accent); }
  .pill input { display:none; }
  .summary { padding:10px 20px; display:flex; justify-content:space-between; color:var(--muted); flex-wrap:wrap; gap:8px; }
  .wrap { overflow-x:auto; padding:0 20px 20px; }
  table { border-collapse:collapse; width:100%; background:#fff; border:1px solid var(--line); }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; white-space:nowrap; }
  th { position:sticky; top:0; background:#f1f3f6; font-size:12px; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
  tr:hover td { background:#fafbff; }
  td.num { text-align:right; }
  a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
  .muted { color:var(--muted); font-size:12px; }
  .red { color:#c62828; font-weight:600; } .amber { color:#b26a00; font-weight:600; }
  .badge { font-size:12px; padding:2px 8px; border-radius:999px; background:#eef0f3; }
  .sa-Y { background:#e3f2fd; color:#0d47a1; } .sa-H { background:#f3e5f5; color:#6a1b9a; }
  .sa-R { background:#e8f5e9; color:#1b5e20; } .sa-L, .sa-E { background:#fce4ec; color:#880e4f; } .sa-A { background:#fff8e1; color:#8d6e00; }
  .pager { display:flex; gap:12px; align-items:center; }
  .flash { margin:10px 20px 0; padding:8px 12px; background:#fff8e1; border:1px solid #f0d58a; border-radius:6px; }
  .empty { padding:40px; text-align:center; color:var(--muted); }
</style></head>
<body>
<header>
  <div><h1>DIBBS RFQ Browser</h1>
    <div class="meta">${stats.open.toLocaleString("en-US")} open of ${stats.total.toLocaleString("en-US")} RFQs · newest posting ${esc(stats.days[0] ? fmtDate(stats.days[0].date) : "–")} · last pull ${esc(lastPull)}</div></div>
  <form method="post" action="/pull"><button title="Download new daily files from DIBBS">↻ Refresh from DIBBS</button></form>
</header>
${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
<form class="filters" method="get" action="/">
  <div class="pills"><b>Who can bid</b>${setAsideBoxes}</div>
  <label class="field">Search item, NSN, solicitation, PR
    <input name="q" value="${esc(f.q)}" placeholder="e.g. valve, 5306-01-…, SPE4A7…" autofocus></label>
  <label class="field">FSC codes <input name="fsc" value="${esc(f.fsc)}" placeholder="5306, 6515"></label>
  <label class="field">Status <select name="status">
    ${option("open", "Open", f.status)}${option("closed", "Closed", f.status)}${option("all", "All", f.status)}</select></label>
  <label class="field">Closing within <select name="closing">
    ${option("", "Any time", f.closing)}${["2", "5", "10", "20"].map((d) => option(d, `${d} days`, f.closing)).join("")}</select></label>
  <label class="field">Min qty <input name="min_qty" type="number" min="0" value="${esc(f.min_qty)}"></label>
  <label class="field">Posted on <select name="posted">
    ${option("", "Any day", f.posted)}${stats.days.map((d) => option(d.date, `${fmtDate(d.date)} (${d.n})`, f.posted)).join("")}</select></label>
  <label class="field">Type <select name="sol_type">
    ${option("", "Any", f.sol_type)}${Object.entries(SOL_TYPES).map(([k, v]) => option(k, v, f.sol_type)).join("")}</select></label>
  <label class="field">Sort <select name="sort">
    ${Object.entries(SORTS).map(([k, s]) => option(k, s.label, f.sort)).join("")}</select></label>
  <a href="/">Reset</a>
</form>
<div class="summary">
  <span><b>${result.total.toLocaleString("en-US")}</b> matching RFQs · bookmark this page to save the search</span>
  <span class="pager">
    ${f.page > 1 ? `<a href="${esc(href(f, { page: f.page - 1 }))}">← Prev</a>` : ""}
    Page ${f.page} of ${pages}
    ${f.page < pages ? `<a href="${esc(href(f, { page: f.page + 1 }))}">Next →</a>` : ""}
  </span>
</div>
<div class="wrap">
${result.rows.length ? `<table>
  <thead><tr><th>Solicitation</th><th>NSN / FSC</th><th>Item</th><th>Qty</th><th>Set-aside</th><th>Posted</th><th>Quote by</th><th></th></tr></thead>
  <tbody>${result.rows.map((r) => row(r, f)).join("")}</tbody>
</table>` : `<div class="empty">No RFQs match these filters. <a href="/">Reset</a></div>`}
</div>
<script>
  // Apply filters instantly: submit on change, debounce typing.
  const form = document.querySelector("form.filters");
  let timer;
  form.addEventListener("change", () => form.submit());
  form.addEventListener("input", (e) => {
    if (e.target.type !== "text" && e.target.type !== "number" && e.target.name !== "q" && e.target.name !== "fsc") return;
    clearTimeout(timer);
    timer = setTimeout(() => form.submit(), 600);
  });
  // Keep the cursor at the end of the search box after reload.
  const q = form.querySelector("input[name=q]");
  q.setSelectionRange(q.value.length, q.value.length);
</script>
</body></html>`;
}
