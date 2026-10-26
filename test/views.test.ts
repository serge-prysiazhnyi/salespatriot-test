import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { esc, links } from "../src/views.js";

describe("esc", () => {
  test("escapes HTML special characters (DIBBS data is shown in the page)", () => {
    assert.equal(esc(`<script>alert("x")</script> & 'y'`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  test("null and undefined become empty strings", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
  });
});

describe("DIBBS links", () => {
  test("package view, NSN history and PDF", () => {
    assert.equal(links.packageView("SPE1C127Q0101"), "https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=SPE1C127Q0101");
    assert.equal(links.nsnHistory("8345001516486"),
      "https://www.dibbs.bsm.dla.mil/RFQ/RFQNsn.aspx?value=8345001516486&category=post&Scope=");
    // Folder = last character of the solicitation; extension upper-cased.
    assert.equal(links.pdf("SPE1C127Q0101", "SPE1C127Q0101.pdf"),
      "https://dibbs2.bsm.dla.mil/Downloads/RFQ/1/SPE1C127Q0101.PDF");
  });

  test("values are URL-encoded", () => {
    assert.equal(links.packageView("A&B C"), "https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=A%26B%20C");
  });
});
