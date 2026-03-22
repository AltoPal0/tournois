CREATE TABLE tt_tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Nouveau Tournoi',
  graph_config JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tt_tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open access" ON tt_tournaments
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tt_tournaments_updated_at
  BEFORE UPDATE ON tt_tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
