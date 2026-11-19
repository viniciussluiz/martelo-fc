-- Ajustes do dono do site sobre o baralho (página de admin): nível e Lenda de cada carta.
-- O baralho vem do arquivo (data/deck-*.json, refeito pelos scripts); estes ajustes ficam no banco,
-- que é o que sobrevive aos deploys, e são aplicados por cima ao subir o servidor.
CREATE TABLE card_overrides (
  card_id    TEXT PRIMARY KEY,
  level_min  INTEGER NOT NULL CHECK (level_min BETWEEN 1 AND 100),
  level_max  INTEGER NOT NULL CHECK (level_max BETWEEN 1 AND 100 AND level_max >= level_min),
  tier       TEXT NOT NULL CHECK (tier IN ('lenda', 'craque', 'titular', 'operario', 'perna')),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
