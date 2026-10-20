# Baralho

O servidor carrega, nesta ordem: `DECK_PATH` (se definido) → `data/deck-wikidata.json` (jogadores reais) → `data/deck.json` (fictício).
O nome do baralho aparece no log ao subir; com um baralho sem grupos de clubes (ex.: o fictício) o servidor avisa no log, e a
sala não mostra a escolha de clubes.

## Jogadores reais (Wikidata)

```bash
npm run deck:wikidata                 # busca no Wikidata e monta data/deck-wikidata.json
npm run deck:wikidata -- --build      # só monta, a partir de data/wikidata-raw.json (offline)
npm run deck:wikidata -- --fetch      # só atualiza data/wikidata-raw.json
```

**Clubes.** A lista fica em `src/tools/wikidata/series.ts`, em três grupos:
- **Série A** e **Série B** do Brasileirão de 2026 (20 clubes cada);
- **Europa**: só os grandes (Real Madrid, Barcelona, Atlético, Sevilla, Valencia, Manchester United e City, Liverpool, Chelsea,
  Arsenal, Tottenham, Juventus, Milan, Inter, Roma, Napoli, Lazio, Bayern, Dortmund, Leverkusen, PSG, Olympique de Marseille,
  Lyon, Monaco, Benfica, Porto, Sporting, Ajax e PSV), para ninguém dar lance em time que nunca viu.

Só passagens por esses clubes viram carta (passagens por outros clubes contam para a fama do jogador). Cada carta leva o grupo
do clube (`series`), e **ao criar a sala** o anfitrião escolhe os clubes das cartas: **Tudo** (padrão), **Séries A e B**,
**Série A**, **Série B** ou **Europa**; o painel mostra quantas cartas e quais clubes entram. Cada grupo sozinho tem cartas para
uma sala de 20 técnicos. Para outra temporada, troque a lista e rode o script.

**De onde vêm os dados.** Do Wikidata, cujos dados estruturados são CC0 (uso livre, sem atribuição obrigatória): todos os
jogadores que passaram pelos clubes da lista e têm artigo em pelo menos 8 Wikipédias (3 nos clubes menores; 30 nos grandes da
Europa, que têm milhares), antigos e atuais. De cada passagem vêm período, jogos e gols, quando registrados.
**Nenhuma foto nem texto da Wikipédia é usado.** Também vêm apelidos (P1449), se a pessoa é técnico, jogos pela seleção e Copas
do Mundo disputadas, e se é jogadora (o baralho é de futebol masculino; jogadoras ficam de fora).

Limitações dos dados: o Wikidata quase não registra os elencos atuais de alguns clubes menores (Mirassol, Remo, Novorizontino,
Athletic), então eles aparecem com poucas cartas ou nenhuma. Erros conhecidos do Wikidata são corrigidos em `STINT_FIXES`
(`build.ts`), por exemplo o Van der Sar registrado no Barcelona quando era o Ajax.

**Nome exibido.** O mais curto entre o título da Wikipédia em português e os rótulos do Wikidata. Se só houver nome de registro
(4+ palavras) de um brasileiro, usa um apelido com palavra em comum ou o prenome (“Cássio Albuquerque dos Anjos” → “Cássio”;
“Paulo Sérgio de Oliveira Lima” → “Paulo Sérgio”). Nomes de 3 palavras costumam ser o nome de guerra e ficam (“Ademir da Guia”).
Homônimos no mesmo baralho: o mais conhecido fica com o nome curto; os outros ganham o último sobrenome (“Reinaldo Silva”).

**Nota (decisão própria; nenhuma fonte aberta tem “overall”).**
1. Fama do jogador = log(artigos em Wikipédias) + prêmios + seleção (jogos e Copas do Mundo) + compensação de era (as
   Wikipédias cobrem muito mais os jogadores recentes; nascidos antes de 1975 ganham pontos) + carreira nos clubes importados
   (jogos, ou temporadas quando não há o número). Quem tem título “(treinador…)” na Wikipédia perde bastante (ex.: Felipão);
   quem também foi técnico perde um pouco (os artigos crescem com a carreira no banco).
   → percentil **dentro da região do clube da carta** (Brasil ou Europa: artigos não se comparam entre elas — um reserva
   inglês tem mais artigos que muito ídolo brasileiro), contra uma população de referência fixa (para que incluir muitos
   desconhecidos não infle a nota dos outros) → nota de auge: top 2,5% 90–97, 88–97,5% 84–90, 55–88% 76–84, 25–55% 68–76,
   resto 56–68. O peso do clube também é medido dentro da região.
2. Cada passagem ajusta o auge: idade no ano representado (jovem ou veterano perde pontos), peso do clube, jogos e gols no
   clube (ídolo com 400+ jogos ganha até +5), gols por jogo (atacantes) e a passagem principal da carreira. Assim o mesmo nome
   vale diferente conforme clube e ano. Passagens curtas têm teto, e **Lenda exige passagem marcante** (100+ jogos ou 4+ anos na passagem principal; 150+ ou 6+ nas outras),
   salvo os maiores astros (top 1,5% de fama, ex.: Ronaldo no Corinthians). Acima de 91 a escala é comprimida: 97 é raro.
3. Dados incompletos (sem jogos ou sem data de nascimento) deixam a faixa mais larga.

É uma heurística sobre dados abertos e incompletos: alguns ídolos ficam abaixo do que a torcida daria (quando o Wikidata não
tem os jogos dele no clube) e alguns jogadores muito citados no exterior ficam acima. Para corrigir, edite o Wikidata ou ajuste
as constantes em `src/tools/wikidata/build.ts` e rode `npm run deck:wikidata -- --build`.

**Seleção.** Até 2 versões (clube/ano) por jogador em cada região — assim Ronaldo tem carta de Cruzeiro/Corinthians para
salas só do Brasil e de Real Madrid/Barcelona para a Europa; o leilão nunca põe duas versões da mesma pessoa juntas
(`personId`). Cada grupo é montado à parte: a melhor versão dos mais famosos entra sempre (top 10% no Brasil, 5% na Europa);
o resto é estratificado por posição e faixa (para haver também operários e pernas-de-pau), preferindo os nomes mais
conhecidos. O baralho atual tem 2.113 cartas: Série A 817 (≈12% Lendas), Série B 330 e Europa 966 (≈14% Lendas).

**Imagens.** As figurinhas são ilustrações próprias, geradas no navegador (sem rosto), com as cores oficiais do clube quando o
Wikidata as tem (ou a tabela de cores dos principais clubes do script). Lendas ganham avatar maior com aro dourado, brilho e
coroa — só depois de reveladas (no martelo e na Cerimônia), para não entregar o nível durante o leilão às cegas.

**Escudos.** Ao lado do nome do clube, cada carta mostra um selo: por padrão, um desenho genérico do jogo (escudo liso nas
cores do clube com a sigla de placar, ex.: FLA, SAO, RMA), **não o escudo oficial** — escudos são marcas registradas e não
vêm no projeto. Quem tiver autorização dos clubes pode colocar os arquivos em `data/escudos/` (ou na pasta de `CRESTS_DIR`),
um por clube, com o nome do clube em minúsculas, sem acento e com hífens: `flamengo.png`, `sao-paulo.svg`,
`atletico-mg.webp`, `inter-de-milao.png` (SVG, PNG, WebP ou JPG). O servidor lista a pasta ao subir e usa a imagem no lugar do
selo; o servidor só entrega arquivos dessa lista.

**Observação.** Os dados são livres, mas usar nomes reais de atletas num produto comercial pode envolver direito de imagem/nome;
avalie com um advogado antes de lançar.

## Formato

```json
{
  "id": "brasileirao-wikidata-v1",
  "name": "Brasileirão — Wikidata",
  "cards": [
    {
      "id": "wd-Q123-Q17479-1981",
      "personId": "Q123",
      "name": "Exemplo",
      "position": "MEI",
      "club": "Flamengo",
      "year": 1981,
      "levelMin": 91,
      "levelMax": 96,
      "tier": "lenda",
      "hint": "212 jogos e 98 gols pelo Flamengo de 1978 a 1983. 28 anos em 1981.",
      "kit": ["#E2001A", "#000000"],
      "series": "A"
    }
  ]
}
```

- `position`: `GOL` | `LAT` | `ZAG` | `MEI` | `ATA`; `tier`: `lenda` | `craque` | `titular` | `operario` | `perna`.
- `levelMin` ≤ `levelMax`, entre 1 e 99; `id` único e estável (usado no histórico e no reaproveitamento entre ciclos).
- Opcionais: `personId` (mesma pessoa em versões diferentes), `kit` (duas cores `#RRGGBB`), `series` (`A` | `B` | `EU`:
  grupo do clube, usado pela escolha de clubes da sala; baralho sem `series` é usado inteiro).
- Para salas de 20 técnicos: ≥ 21 GOL, ≥ 41 LAT, ≥ 41 ZAG, ≥ 81 MEI e ≥ 61 ATA. Se faltar carta, o Monte completa com reservas genéricas.

## Baralho fictício
`npm run deck:generate` recria `data/deck.json` (320 cartas, determinístico). É usado nos testes e quando não há baralho real.
