# DIBBS RFQ Browser

Pulls the daily Requests for Quotation from [DIBBS](https://www.dibbs.bsm.dla.mil/) into Postgres and helps a
vendor find the ones worth quoting on. Every row links back to DIBBS: package view, NSN history, and the solicitation PDF.

**Stack:** TypeScript (run with `tsx`, no build step), Node 22, Express, Postgres 16 (Docker), server-rendered HTML.

## Run

```bash
npm install
cp .env.example .env   # set the database login and password
npm run db      # Postgres in Docker on localhost:5434, schema applied
npm run pull    # import every day DIBBS lists (~40 s first time, then only new days)
npm start       # http://localhost:8787
npm test        # unit tests (no database or network needed)
```

## How the data is pulled

- DIBBS puts a DoD consent banner in front of every page. `src/dibbs.ts` accepts it the way a browser does:
  it posts the banner form back and keeps cookies per host (`www` and `dibbs2` each have their own banner).
- **Source: the daily index files** (`inYYMMDD.txt`) linked from *RFQs → Recent*, not the HTML search grid.
  That's one GET per day instead of ~50 viewstate POSTs per day, in a documented fixed-width format with more
  fields (set-aside, AMSC, unit, buyer). It is the bulk download DIBBS provides for this.
- Each file is imported in one transaction with batched upserts keyed on `(solicitation, pr)`, so re-runs are safe.
  `pulled_files` records which days are done.

## How a vendor finds opportunities

The filters follow the questions a vendor asks, in this order:

1. **Can I bid?** Set-aside pills with counts (Small Business, HUBZone, SDVOSB, WOSB, …).
2. **Do I sell this?** FSC codes (the first 4 digits of the NSN, which is how vendors think about their catalog)
   and free text over item name, NSN, solicitation and PR. Dashes are ignored, so pasted DIBBS numbers match.
3. **Is there still time?** Open by default, sorted by deadline. "Closing within N days" filter;
   days left is shown red under 3 days and amber under 7.
4. **Is it worth it?** Minimum quantity and sorting by quantity.
5. **What's new?** Filter by posting day, or sort by newest posted.

All filters live in the URL, so **a bookmark is a saved search** (e.g. "my FSCs, small business, open").
Clicking an FSC in the table narrows to that class.

## Database indexes

Defined in `schema.sql`. Plans checked with `EXPLAIN ANALYZE` on the app's real queries (44,860 rows):

| Index | Used for | Measured |
|---|---|---|
| Primary key `(solicitation, pr)` | Duplicate check in every import upsert; exact solicitation lookups | 0.1 ms |
| `rfqs_return_by` | Default view (open, soonest deadline first); "closing within N days" | 2–4 ms |
| `rfqs_posted_date` | "Newest posted" sort; "Posted on" filter | 0.6–7 ms |
| `rfqs_fsc` | FSC filter | under 1 ms |

Postgres picks per query. With the default deadline sort it walks `rfqs_return_by` in order and checks
the FSC or posted-day filter on each row, so the rows come out sorted and it stops after 50. With other
sorts it uses `rfqs_fsc` / `rfqs_posted_date` directly to pick the matching rows, often combined with
`rfqs_return_by`.

Not indexed, on purpose:

- **Free-text search** (`nomenclature ILIKE '%valve%'`): a B-tree can't help when the pattern starts with `%`.
  It's the slowest query at about 14 ms. At millions of rows, add `pg_trgm` with a GIN index on `nomenclature`.
- **Set-aside, AMSC, solicitation type:** only a few values each, and one value covers most rows
  (85% are unrestricted), so an index barely helps.

Pagination is `LIMIT`/`OFFSET`, which keeps "Page X of Y" and page numbers in the URL. The last page of
all 44,860 rows loads in about 50 ms. At much larger scale, switch to cursor paging on
`(return_by, solicitation, pr)`.

## Tests

`npm test` runs 22 unit tests with Node's built-in test runner (`node:test`, no extra dependencies) in under a second.
They cover only the critical paths:

- **Parsing** (`test/parse.test.ts`): every field of a real DIBBS line, part numbers, blank set-aside, and the
  format checks that stop an import when DIBBS changes the file layout.
- **Search SQL** (`test/search.test.ts`): user text only reaches SQL as parameters, the ORDER BY allow-list,
  junk input falling back to defaults, dash stripping, literal `%`/`_`, impossible dates, page offsets.
- **Output** (`test/views.test.ts`): HTML escaping and the links back to DIBBS.

Not covered: the DIBBS HTTP client (consent, retries) and the import into Postgres. Those were checked by hand
against a local fake server and the real site; an integration test with a test database would be next.

## Tradeoffs / left out

- Server-rendered HTML instead of React: one process, no build, shareable URLs, about 15 lines of client JS.
- No ORM or migrations tool: `schema.sql` with `IF NOT EXISTS`, plus parameterized SQL and an allow-list for ORDER BY.
- **Today's RFQs appear tomorrow:** DIBBS publishes a day's index file after the day ends. The fix would be paging the
  search grid for the current day only.
- No "Technical documents" or "Mil-Spec" flags (those are only in the grid), no auth, no scheduler
  (use cron: `0 6 * * * npm run pull`).
- Next ideas: saved vendor profiles with "new matches since last visit", FSC names, a trigram index for search at
  larger scale, and an email digest.
