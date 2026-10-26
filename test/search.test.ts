import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSearchQuery, readFilters } from "../src/search.js";

const query = (params: Record<string, unknown>) => buildSearchQuery(readFilters(params));

describe("readFilters", () => {
  test("defaults: open RFQs, soonest deadline, page 1", () => {
    const f = readFilters({});
    assert.equal(f.status, "open");
    assert.equal(f.sort, "deadline");
    assert.equal(f.page, 1);
  });

  test("junk values fall back to defaults", () => {
    const f = readFilters({ status: "evil", sort: "return_by; DROP TABLE rfqs", page: "abc" });
    assert.equal(f.status, "open");
    assert.equal(f.sort, "deadline");
    assert.equal(f.page, 1);
  });

  test("a huge page number falls back to page 1 (would be 5e+22 as an OFFSET)", () => {
    assert.equal(readFilters({ page: "999999999999999999999" }).page, 1);
  });

  test("repeated set_aside params become a list", () => {
    assert.deepEqual(readFilters({ set_aside: ["Y", "L"] }).set_aside, ["Y", "L"]);
    assert.deepEqual(readFilters({ set_aside: "Y" }).set_aside, ["Y"]);
  });
});

describe("buildSearchQuery", () => {
  test("user text goes into params, never into the SQL", () => {
    const evil = "x'; DROP TABLE rfqs; --";
    const { sql, params } = query({ q: evil, set_aside: evil, sol_type: evil });
    assert.ok(!sql.includes("DROP"), sql);
    assert.ok(params.some((p) => String(p).includes("DROP")));
  });

  test("ORDER BY comes from the allow-list", () => {
    assert.match(query({ sort: "qty_desc" }).sql, /ORDER BY qty DESC/);
    assert.match(query({ sort: "rfqs; DROP" }).sql, /ORDER BY return_by ASC/);
  });

  test("dashes are stripped for code columns but kept for the item name", () => {
    const { params } = query({ q: "SPE1C1-27-Q-0101" });
    assert.equal(params[0], "%SPE1C127Q0101%");
    assert.equal(params[1], "%SPE1C1-27-Q-0101%");
  });

  test("% and _ in the search box match literally", () => {
    const { params } = query({ q: "50%_off" });
    assert.equal(params[1], "%50\\%\\_off%");
  });

  test("impossible dates are ignored instead of reaching Postgres", () => {
    assert.doesNotMatch(query({ posted: "2026-99-99" }).sql, /posted_date =/);
    assert.doesNotMatch(query({ posted: "2026-02-30" }).sql, /posted_date =/);
    assert.match(query({ posted: "2026-10-23" }).sql, /posted_date = \$1/);
  });

  test("only valid 4-digit FSC codes are used", () => {
    const { params } = query({ fsc: "6515, 5306,abc,12345" });
    assert.deepEqual(params[0], ["6515", "5306"]);
  });

  test("placeholders match params; page 3 skips 100 rows", () => {
    const { sql, params } = query({ q: "valve", fsc: "4820", min_qty: "10", page: "3" });
    const placeholders = new Set(sql.match(/\$\d+/g));
    assert.equal(placeholders.size, params.length);
    assert.deepEqual(params.slice(-2), [50, 100]);
  });
});
