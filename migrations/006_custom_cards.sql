-- Jogadores criados pelo dono do site (página de admin). A carta inteira fica aqui, em JSON, e entra
-- no baralho ao subir o servidor, junto com as do arquivo. Nível e Lenda ajustados depois vão para
-- card_overrides, como os de qualquer carta.
CREATE TABLE custom_cards (
  id         TEXT PRIMARY KEY,
  card_json  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);
