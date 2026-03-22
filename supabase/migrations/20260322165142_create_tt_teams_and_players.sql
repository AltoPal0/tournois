-- Table joueurs
CREATE TABLE tt_joueurs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prenom TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tt_joueurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access" ON tt_joueurs FOR ALL USING (true) WITH CHECK (true);

-- Table teams (2 joueurs par équipe)
CREATE TABLE tt_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  joueur1_id UUID NOT NULL REFERENCES tt_joueurs(id) ON DELETE CASCADE,
  joueur2_id UUID NOT NULL REFERENCES tt_joueurs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT different_players CHECK (joueur1_id <> joueur2_id)
);

ALTER TABLE tt_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access" ON tt_teams FOR ALL USING (true) WITH CHECK (true);

-- Seed: 100 joueurs fictifs
INSERT INTO tt_joueurs (prenom) VALUES
  ('Lucas'),('Emma'),('Hugo'),('Léa'),('Louis'),('Chloé'),('Nathan'),('Manon'),('Gabriel'),('Inès'),
  ('Raphaël'),('Jade'),('Arthur'),('Louise'),('Jules'),('Alice'),('Ethan'),('Lina'),('Adam'),('Rose'),
  ('Léo'),('Ambre'),('Maël'),('Anna'),('Tom'),('Mila'),('Noah'),('Julia'),('Théo'),('Zoé'),
  ('Sacha'),('Eva'),('Maxime'),('Camille'),('Enzo'),('Léonie'),('Paul'),('Sarah'),('Axel'),('Clara'),
  ('Nolan'),('Margot'),('Aaron'),('Romane'),('Baptiste'),('Lola'),('Mohamed'),('Juliette'),('Victor'),('Agathe'),
  ('Rayan'),('Charlotte'),('Mathis'),('Pauline'),('Liam'),('Marine'),('Oscar'),('Mathilde'),('Samuel'),('Océane'),
  ('Robin'),('Victoire'),('Diego'),('Clémence'),('Timéo'),('Apolline'),('Eliott'),('Lucie'),('Valentin'),('Lisa'),
  ('Martin'),('Capucine'),('Simon'),('Élise'),('Alexandre'),('Yasmine'),('Clément'),('Nora'),('Pierre'),('Anaïs'),
  ('Antoine'),('Célia'),('Gaspard'),('Iris'),('Augustin'),('Constance'),('Émile'),('Diane'),('Basile'),('Hélène'),
  ('Florian'),('Salomé'),('Tristan'),('Éva'),('Adrien'),('Stella'),('Damien'),('Aurore'),('Julien'),('Margaux');

-- Seed: 50 teams (paires aléatoires sans doublon)
DO $$
DECLARE
  ids UUID[];
  i INT;
BEGIN
  SELECT array_agg(id ORDER BY random()) INTO ids FROM tt_joueurs;
  FOR i IN 0..49 LOOP
    INSERT INTO tt_teams (joueur1_id, joueur2_id)
    VALUES (ids[i*2 + 1], ids[i*2 + 2]);
  END LOOP;
END $$;
