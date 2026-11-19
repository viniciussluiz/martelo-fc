-- Faces para gerar: toda vez que o dono marca como Lenda alguém sem retrato ilustrado, a pessoa entra
-- aqui (uma linha por pessoa: art_key é o QID do Wikidata ou, para jogador criado no admin, o id da carta).
-- Sai sozinha quando deixa de ser Lenda ou quando o retrato chega no site.
CREATE TABLE face_queue (
  art_key    TEXT PRIMARY KEY,
  card_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  club       TEXT NOT NULL,
  year       INTEGER NOT NULL,
  position   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
