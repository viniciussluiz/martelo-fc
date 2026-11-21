-- Fechamento das temporadas do ranking (o mês, no horário de Brasília). Quando o mês acaba, o servidor
-- grava uma vez só quem terminou entre os 10 primeiros; é isso que dá as conquistas de temporada.
-- Fica gravado como estava no fechamento, mesmo que os pesos da pontuação mudem depois.
CREATE TABLE season_closures (
  season      TEXT PRIMARY KEY,          -- '2026-11'
  technicians INTEGER NOT NULL,          -- técnicos no ranking da temporada (contas registradas)
  closed_at   TEXT NOT NULL
);

CREATE TABLE season_awards (
  season   TEXT NOT NULL REFERENCES season_closures(season),
  user_id  TEXT NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  points   INTEGER NOT NULL,
  PRIMARY KEY (season, user_id)
);
CREATE INDEX idx_season_awards_user ON season_awards(user_id);
