// Parses one line of a DIBBS daily RFQ index file (fixed width, 140 chars).
// Layout from https://www.dibbs.bsm.dla.mil/Rfq/RfqFileDefs.aspx

export type Rfq = {
  solicitation: string;
  pr: string;
  nsn: string;
  fsc: string;
  nomenclature: string;
  qty: number;
  unit: string;
  return_by: string;
  posted_date: string;
  file_name: string;
  buyer_code: string;
  amsc: string;
  item_type: string;
  set_aside: string;
  set_aside_pct: string;
  sol_type: string;
};

export const LINE_LENGTH = 140;

const SET_ASIDE_CODES = " NYHRLAE"; // blank = unrestricted

// Returns why a line doesn't look like the documented layout, or null if it does.
// Catches format changes on the DIBBS side (shifted columns, error pages instead of files).
export function validateLine(line: string): string | null {
  if (line.length !== LINE_LENGTH) return `length ${line.length}, expected ${LINE_LENGTH}`;
  if (!/^[A-Z0-9]{13}$/.test(line.substr(0, 13))) return "bad solicitation number";
  if (!line.substr(13, 46).trim()) return "empty NSN / part number";
  if (!/^\d\d\/\d\d\/\d\d$/.test(line.substr(72, 8))) return "bad return-by date";
  if (!/^\d{7}$/.test(line.substr(99, 7))) return "bad quantity";
  if (!"12".includes(line.charAt(135))) return "bad item type";
  if (!SET_ASIDE_CODES.includes(line.charAt(136))) return "unknown set-aside code";
  return null;
}

export function parseLine(line: string, postedDate: string): Rfq {
  const cut = (start: number, width: number) => line.substr(start, width).trim();
  const solicitation = cut(0, 13);
  const nsn = cut(13, 46);
  const itemType = cut(135, 1);
  const returnBy = cut(72, 8); // MM/DD/YY
  return {
    solicitation,
    nsn,
    fsc: itemType === "1" ? nsn.slice(0, 4) : "",
    pr: cut(59, 13),
    return_by: `20${returnBy.slice(6, 8)}-${returnBy.slice(0, 2)}-${returnBy.slice(3, 5)}`,
    file_name: cut(80, 19),
    qty: parseInt(cut(99, 7), 10),
    unit: cut(106, 2),
    nomenclature: cut(108, 21),
    buyer_code: cut(129, 5),
    amsc: cut(134, 1),
    item_type: itemType,
    set_aside: cut(136, 1) || "N",
    set_aside_pct: cut(137, 3),
    sol_type: solicitation.charAt(8),
    posted_date: postedDate,
  };
}

// "in261023.txt" -> "2026-10-23"
export function postedDateFromFile(fileName: string): string {
  const m = fileName.match(/in(\d\d)(\d\d)(\d\d)\.txt$/i);
  if (!m) throw new Error("Unexpected file name: " + fileName);
  return `20${m[1]}-${m[2]}-${m[3]}`;
}
