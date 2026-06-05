ALTER TABLE tt_tournaments
  DROP CONSTRAINT IF EXISTS tt_tournaments_status_check;

ALTER TABLE tt_tournaments
  ADD CONSTRAINT tt_tournaments_status_check
    CHECK (status IN ('draft', 'configured', 'active', 'completed'));
