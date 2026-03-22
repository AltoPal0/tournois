CREATE TABLE tt_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tt_tournaments(id) ON DELETE CASCADE,
  phase_node_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_jouer' CHECK (statut IN ('a_jouer', 'termine')),
  equipe1_id UUID REFERENCES tt_teams(id) ON DELETE SET NULL,
  equipe2_id UUID REFERENCES tt_teams(id) ON DELETE SET NULL,
  equipe1_label TEXT,
  equipe2_label TEXT,
  horaire TIMESTAMPTZ,
  piste SMALLINT,
  ordre INT NOT NULL DEFAULT 0,
  round INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tt_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access" ON tt_matches FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_tt_matches_tournament ON tt_matches(tournament_id);
CREATE INDEX idx_tt_matches_phase ON tt_matches(tournament_id, phase_node_id);
