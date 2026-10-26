import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseLine, postedDateFromFile, validateLine } from "../src/parse.js";

// A real line from DIBBS file in261023.txt (140 chars).
const NSN_LINE =
  "SPE1C127Q01018345001516486                                    701794650610/30/26SPE1C127Q0101.pdf  0002880EAFLAG,NATIONAL        DAW02G1Y100";

// Replace `text` at a fixed position, keeping the line length.
const put = (line: string, start: number, text: string) => line.slice(0, start) + text + line.slice(start + text.length);

describe("parseLine", () => {
  test("reads every field of a real NSN line", () => {
    assert.deepEqual(parseLine(NSN_LINE, "2026-10-23"), {
      solicitation: "SPE1C127Q0101",
      nsn: "8345001516486",
      fsc: "8345",
      pr: "7017946506",
      return_by: "2026-10-30",
      file_name: "SPE1C127Q0101.pdf",
      qty: 2880,
      unit: "EA",
      nomenclature: "FLAG,NATIONAL",
      buyer_code: "DAW02",
      amsc: "G",
      item_type: "1",
      set_aside: "Y",
      set_aside_pct: "100",
      sol_type: "Q",
      posted_date: "2026-10-23",
    });
  });

  test("part numbers (item type 2) get no FSC", () => {
    const line = put(put(NSN_LINE, 13, "4PAQ1D13495142".padEnd(46)), 135, "2");
    const row = parseLine(line, "2026-10-25");
    assert.equal(row.nsn, "4PAQ1D13495142");
    assert.equal(row.fsc, "");
  });

  test("blank set-aside means unrestricted (N)", () => {
    assert.equal(parseLine(put(NSN_LINE, 136, " "), "2026-10-23").set_aside, "N");
  });
});

describe("validateLine", () => {
  test("accepts a real line", () => {
    assert.equal(validateLine(NSN_LINE), null);
  });

  test("rejects lines that don't match the layout", () => {
    const cases: [string, string, RegExp][] = [
      ["too short", NSN_LINE.slice(0, 120), /length/],
      ["columns shifted by one", " " + NSN_LINE.slice(0, 139), /solicitation/],
      ["empty NSN", put(NSN_LINE, 13, " ".repeat(46)), /NSN/],
      ["date format changed", put(NSN_LINE, 72, "2026-10-"), /date/],
      ["quantity not numeric", put(NSN_LINE, 99, "  2,880"), /quantity/],
      ["unknown item type", put(NSN_LINE, 135, "9"), /item type/],
      ["unknown set-aside", put(NSN_LINE, 136, "Z"), /set-aside/],
      ["HTML error page", "<!DOCTYPE html><html><body>Maintenance</body></html>", /length/],
    ];
    for (const [name, line, reason] of cases) {
      assert.match(validateLine(line) ?? "accepted", reason, name);
    }
  });
});

describe("postedDateFromFile", () => {
  test("turns the file name into a date", () => {
    assert.equal(postedDateFromFile("in261023.txt"), "2026-10-23");
  });

  test("throws on an unexpected file name", () => {
    assert.throws(() => postedDateFromFile("ca261023.zip"));
  });
});
