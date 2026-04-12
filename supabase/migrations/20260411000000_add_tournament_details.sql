ALTER TABLE tt_tournaments
  ADD COLUMN lieu TEXT,
  ADD COLUMN image_url TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed'));
