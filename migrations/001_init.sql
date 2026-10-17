-- Martelo FC — esquema inicial.
-- Convenções: ids TEXT (uuid/nanoid), datas ISO-8601 em UTC (TEXT), booleanos INTEGER 0/1.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT,
  is_guest      INTEGER NOT NULL DEFAULT 1 CHECK (is_guest IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Sala persistente: sobrevive a várias disputas (ciclos).
CREATE TABLE rooms (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  mode               TEXT NOT NULL CHECK (mode IN ('online', 'solo')),
  host_user_id       TEXT NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL CHECK (status IN ('lobby', 'in_dispute', 'post_dispute', 'closed')),
  settings_json      TEXT NOT NULL,
  cycle              INTEGER NOT NULL DEFAULT 0,
  current_dispute_id TEXT,
  continuation_json  TEXT,
  version            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  closed_at          TEXT
);
CREATE INDEX idx_rooms_status ON rooms(status);

CREATE TABLE room_members (
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  team_name  TEXT NOT NULL,
  formation  TEXT NOT NULL CHECK (formation IN ('4-3-3', '4-4-2')),
  seat       INTEGER NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'left')),
  joined_at  TEXT NOT NULL,
  left_at    TEXT,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX idx_members_user ON room_members(user_id);

-- Disputa individual (um ciclo leilão → liga → copa) ligada à sala.
CREATE TABLE disputes (
  id                  TEXT PRIMARY KEY,
  room_id             TEXT NOT NULL REFERENCES rooms(id),
  seq                 INTEGER NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('active', 'finished', 'aborted')),
  phase               TEXT NOT NULL,
  seed                TEXT NOT NULL,
  config_json         TEXT NOT NULL,
  -- Snapshot operacional (só enquanto ativa). Limpo ao terminar.
  state_json          TEXT,
  previous_dispute_id TEXT REFERENCES disputes(id),
  carried_card_count  INTEGER NOT NULL DEFAULT 0,
  result_json         TEXT,
  started_at          TEXT NOT NULL,
  finished_at         TEXT,
  UNIQUE (room_id, seq)
);
CREATE INDEX idx_disputes_room ON disputes(room_id, seq);

-- Resultado histórico por técnico (humano ou CPU).
CREATE TABLE dispute_participants (
  dispute_id      TEXT NOT NULL REFERENCES disputes(id),
  participant_id  TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id),
  team_name       TEXT NOT NULL,
  is_cpu          INTEGER NOT NULL,
  formation       TEXT NOT NULL,
  abandoned       INTEGER NOT NULL DEFAULT 0,
  league_position INTEGER NOT NULL,
  league_points   INTEGER NOT NULL,
  won             INTEGER NOT NULL,
  drawn           INTEGER NOT NULL,
  lost            INTEGER NOT NULL,
  goals_for       INTEGER NOT NULL,
  goals_against   INTEGER NOT NULL,
  cup_reach       TEXT,
  league_title    INTEGER NOT NULL DEFAULT 0,
  cup_title       INTEGER NOT NULL DEFAULT 0,
  rank            INTEGER NOT NULL,
  coins_left      INTEGER NOT NULL,
  spent           INTEGER NOT NULL,
  auction_wins    INTEGER NOT NULL,
  squad_average   REAL NOT NULL,
  PRIMARY KEY (dispute_id, participant_id)
);
CREATE INDEX idx_dp_user ON dispute_participants(user_id);

CREATE TABLE dispute_rosters (
  dispute_id     TEXT NOT NULL REFERENCES disputes(id),
  participant_id TEXT NOT NULL,
  card_id        TEXT NOT NULL,
  position       TEXT NOT NULL,
  price          INTEGER NOT NULL,
  source         TEXT NOT NULL,
  card_json      TEXT NOT NULL,
  PRIMARY KEY (dispute_id, card_id)
);
CREATE INDEX idx_rosters_participant ON dispute_rosters(dispute_id, participant_id);

-- Partidas que envolvem pelo menos um técnico humano (base de sequências e confrontos).
CREATE TABLE matches (
  dispute_id          TEXT NOT NULL REFERENCES disputes(id),
  match_id            TEXT NOT NULL,
  seq                 INTEGER NOT NULL,
  competition         TEXT NOT NULL CHECK (competition IN ('liga', 'copa')),
  stage               TEXT NOT NULL,
  home_team_id        TEXT NOT NULL,
  away_team_id        TEXT NOT NULL,
  home_name           TEXT NOT NULL,
  away_name           TEXT NOT NULL,
  home_user_id        TEXT,
  away_user_id        TEXT,
  home_goals          INTEGER NOT NULL,
  away_goals          INTEGER NOT NULL,
  pen_home            INTEGER,
  pen_away            INTEGER,
  PRIMARY KEY (dispute_id, match_id)
);
CREATE INDEX idx_matches_home_user ON matches(home_user_id);
CREATE INDEX idx_matches_away_user ON matches(away_user_id);

-- Confrontos entre dois usuários, um registro por (disputa, modalidade, referência, par).
-- user_a < user_b (ordem lexicográfica) para garantir unicidade do par.
CREATE TABLE confrontations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id  TEXT NOT NULL REFERENCES disputes(id),
  kind        TEXT NOT NULL CHECK (kind IN ('ciclo', 'liga', 'copa', 'partida', 'eliminatoria', 'lance')),
  ref         TEXT NOT NULL,
  competition TEXT,
  user_a      TEXT NOT NULL REFERENCES users(id),
  user_b      TEXT NOT NULL REFERENCES users(id),
  outcome     TEXT NOT NULL CHECK (outcome IN ('a', 'b', 'empate')),
  score_a     INTEGER,
  score_b     INTEGER,
  detail_json TEXT,
  occurred_at TEXT NOT NULL,
  UNIQUE (dispute_id, kind, ref, user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX idx_conf_pair ON confrontations(user_a, user_b, kind);
CREATE INDEX idx_conf_b ON confrontations(user_b, user_a, kind);

CREATE TABLE user_achievements (
  user_id        TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  unlocked_at    TEXT NOT NULL,
  dispute_id     TEXT REFERENCES disputes(id),
  PRIMARY KEY (user_id, achievement_id)
);

-- Idempotência de efeitos colaterais (finalização de disputa etc.).
CREATE TABLE processed_events (
  event_key    TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
