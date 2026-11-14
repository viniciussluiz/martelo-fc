-- E-mail da conta (para recuperar a senha) e pedidos de redefinição de senha.
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;

-- O link enviado por e-mail leva um token aleatório; aqui fica só o hash SHA-256, com validade.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
