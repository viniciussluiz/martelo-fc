-- Ranking dos técnicos: os fatos de cada disputa concluída por usuário (humano que não abandonou).
-- Os pontos são calculados na consulta, com os pesos de src/shared/ranking.ts: mudar um peso
-- recalcula o histórico inteiro sem nova migração.
CREATE TABLE ranking_entries (
  dispute_id    TEXT NOT NULL REFERENCES disputes(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  room_id       TEXT NOT NULL,
  finished_at   TEXT NOT NULL,
  season        TEXT NOT NULL,             -- '2026-11': mês no horário de Brasília (UTC-3)
  cup_format    TEXT NOT NULL,             -- copa8 | libertadores | mundial | nenhuma
  skip_league   INTEGER NOT NULL DEFAULT 0,
  humans        INTEGER NOT NULL,          -- humanos que terminaram a disputa
  technicians   INTEGER NOT NULL,          -- humanos + CPUs no leilão
  league_won    INTEGER NOT NULL,
  league_drawn  INTEGER NOT NULL,
  league_lost   INTEGER NOT NULL,
  cup_won       INTEGER NOT NULL,          -- jogos da copa de cup_format (pênaltis = empate)
  cup_drawn     INTEGER NOT NULL,
  cup_lost      INTEGER NOT NULL,
  goals_for     INTEGER NOT NULL,          -- liga + copa
  goals_against INTEGER NOT NULL,
  league_title  INTEGER NOT NULL,
  cup_title     INTEGER NOT NULL,
  PRIMARY KEY (dispute_id, user_id)
);
CREATE INDEX idx_ranking_season ON ranking_entries(season);
CREATE INDEX idx_ranking_user ON ranking_entries(user_id);

-- Histórico já jogado: as partidas de cada humano (tabela matches), somadas por disputa e competição.
WITH side AS (
  SELECT dispute_id, competition, home_user_id AS user_id, home_goals AS gf, away_goals AS ga FROM matches WHERE home_user_id IS NOT NULL
  UNION ALL
  SELECT dispute_id, competition, away_user_id, away_goals, home_goals FROM matches WHERE away_user_id IS NOT NULL
),
agg AS (
  SELECT dispute_id, user_id,
         SUM(competition = 'liga' AND gf > ga) AS lw, SUM(competition = 'liga' AND gf = ga) AS ld, SUM(competition = 'liga' AND gf < ga) AS ll,
         SUM(competition = 'copa' AND gf > ga) AS cw, SUM(competition = 'copa' AND gf = ga) AS cd, SUM(competition = 'copa' AND gf < ga) AS cl,
         SUM(gf) AS gf, SUM(ga) AS ga
    FROM side
   GROUP BY dispute_id, user_id
)
INSERT INTO ranking_entries (dispute_id, user_id, room_id, finished_at, season, cup_format, skip_league, humans, technicians,
                             league_won, league_drawn, league_lost, cup_won, cup_drawn, cup_lost, goals_for, goals_against, league_title, cup_title)
SELECT dp.dispute_id, dp.user_id, d.room_id, d.finished_at,
       strftime('%Y-%m', d.finished_at, '-3 hours'),
       COALESCE(json_extract(d.config_json, '$.cupFormat'), 'nenhuma'),
       COALESCE(json_extract(d.config_json, '$.skipLeague'), 0),
       (SELECT COUNT(*) FROM dispute_participants x WHERE x.dispute_id = dp.dispute_id AND x.is_cpu = 0 AND x.abandoned = 0),
       (SELECT COUNT(*) FROM dispute_participants x WHERE x.dispute_id = dp.dispute_id),
       COALESCE(a.lw, 0), COALESCE(a.ld, 0), COALESCE(a.ll, 0), COALESCE(a.cw, 0), COALESCE(a.cd, 0), COALESCE(a.cl, 0),
       COALESCE(a.gf, 0), COALESCE(a.ga, 0), dp.league_title, dp.cup_title
  FROM dispute_participants dp
  JOIN disputes d ON d.id = dp.dispute_id
  LEFT JOIN agg a ON a.dispute_id = dp.dispute_id AND a.user_id = dp.user_id
 WHERE d.status = 'finished' AND d.finished_at IS NOT NULL AND dp.user_id IS NOT NULL AND dp.is_cpu = 0 AND dp.abandoned = 0;
