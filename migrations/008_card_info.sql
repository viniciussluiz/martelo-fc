-- Edição das informações da carta na página de admin (nome, posição, clube, ano, e o grupo e as cores
-- que vêm com o clube). JSON com a carta como o dono deixou; NULL = as informações são as do arquivo.
ALTER TABLE card_overrides ADD COLUMN info TEXT;
