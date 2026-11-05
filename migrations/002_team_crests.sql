-- Escudo do time de cada técnico (receita JSON montada no criador de escudos; nulo = escudo gerado pelo id).
ALTER TABLE users ADD COLUMN crest_json TEXT;
