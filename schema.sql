-- One row = one line of a DIBBS daily index file = one purchase request (PR) on one solicitation.
CREATE TABLE IF NOT EXISTS rfqs (
  solicitation  TEXT    NOT NULL,          -- stored without dashes, e.g. SPE1C127Q0101
  pr            TEXT    NOT NULL,          -- purchase request number
  nsn           TEXT    NOT NULL,          -- 13-digit NSN or a part number
  fsc           TEXT    NOT NULL,          -- first 4 digits of the NSN ('' for part numbers)
  nomenclature  TEXT    NOT NULL,
  qty           INTEGER NOT NULL,
  unit          TEXT    NOT NULL,
  return_by     DATE    NOT NULL,          -- quote deadline
  posted_date   DATE    NOT NULL,          -- from the file name
  file_name     TEXT    NOT NULL,          -- solicitation PDF
  buyer_code    TEXT    NOT NULL,
  amsc          TEXT    NOT NULL,
  item_type     TEXT    NOT NULL,          -- 1 = NSN, 2 = part number
  set_aside     TEXT    NOT NULL,          -- who may bid (N = unrestricted)
  set_aside_pct TEXT    NOT NULL,
  sol_type      TEXT    NOT NULL,          -- 9th char of solicitation: Q / T / U
  PRIMARY KEY (solicitation, pr)
);
CREATE INDEX IF NOT EXISTS rfqs_return_by ON rfqs (return_by);
CREATE INDEX IF NOT EXISTS rfqs_posted_date ON rfqs (posted_date);
CREATE INDEX IF NOT EXISTS rfqs_fsc ON rfqs (fsc);

CREATE TABLE IF NOT EXISTS pulled_files (
  file_name TEXT PRIMARY KEY,
  row_count INTEGER NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
