-- Sala com senha (fechada): fica só o hash da senha. Sem senha, a sala é aberta.
-- Ocultar a sala da lista de salas em andamento é uma regra da sala (settings_json.hidden).
ALTER TABLE rooms ADD COLUMN password_hash TEXT;
