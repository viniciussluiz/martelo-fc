# Baralho

O servidor carrega, nesta ordem: `DECK_PATH` (se definido) → `data/deck-wikidata.json` (jogadores reais) → `data/deck.json` (fictício).

## Jogadores reais (Wikidata)

```bash
npm run deck:wikidata                 # busca no Wikidata e monta data/deck-wikidata.json
npm run deck:wikidata -- --build      # só monta, a partir de data/wikidata-raw.json (offline)
npm run deck:wikidata -- --fetch      # só atualiza data/wikidata-raw.json
# opções: --clubs 24  --min-sitelinks 8  --country Q155
```

**De onde vêm os dados.** Do Wikidata, cujos dados estruturados são CC0 (uso livre, sem atribuição obrigatória). O script busca os
clubes mais conhecidos do país (por número de artigos na Wikipédia) e todos os jogadores que passaram por eles e têm artigo em
pelo menos 8 Wikipédias — antigos e atuais. De cada passagem por clube vêm período, jogos e gols, quando registrados.
**Nenhuma foto nem texto da Wikipédia é usado.** Também vêm marcações que ajudam a limpar o baralho: apelidos (P1449),
se a pessoa é técnico, se jogou por seleção e se é jogadora (o baralho é de futebol masculino; jogadoras ficam de fora).

**Nome exibido.** O mais curto entre o título da Wikipédia em português e os rótulos do Wikidata. Se só houver nome de registro
(4+ palavras) de um brasileiro, usa um apelido com palavra em comum ou o prenome (“Cássio Albuquerque dos Anjos” → “Cássio”;
“Paulo Sérgio de Oliveira Lima” → “Paulo Sérgio”). Nomes de 3 palavras costumam ser o nome de guerra e ficam (“Ademir da Guia”).
Homônimos no mesmo baralho: o mais conhecido fica com o nome curto; os outros ganham o último sobrenome (“Reinaldo Silva”).

**Nota (decisão própria; nenhuma fonte aberta tem “overall”).**
1. Fama do jogador = log(artigos em Wikipédias) + prêmios + seleção + compensação de era (as Wikipédias cobrem muito mais os
   jogadores recentes; nascidos antes de 1975 ganham pontos) + carreira nos clubes importados (jogos, ou temporadas quando não
   há o número). Quem tem título “(treinador…)” na Wikipédia perde bastante: os artigos falam do banco, não do campo (ex.: Felipão).
   → percentil entre todos os candidatos → nota de auge: top 2,5% 90–97, 88–97,5% 84–90, 55–88% 76–84, 25–55% 68–76, resto 56–68.
2. Cada passagem ajusta o auge: idade no ano representado (jovem ou veterano perde pontos), peso do clube, jogos e gols no
   clube (ídolo com 400+ jogos ganha até +5), gols por jogo (atacantes) e a passagem principal da carreira. Assim o mesmo nome
   vale diferente conforme clube e ano. Passagens curtas têm teto, e **Lenda exige passagem marcante** (100+ jogos ou 4+ anos na passagem principal; 150+ ou 6+ nas outras),
   salvo os maiores astros (top 1,5% de fama, ex.: Ronaldo no Corinthians). Acima de 91 a escala é comprimida: 97 é raro.
3. Dados incompletos (sem jogos ou sem data de nascimento) deixam a faixa mais larga.

É uma heurística sobre dados abertos e incompletos: alguns ídolos ficam abaixo do que a torcida daria (quando o Wikidata não
tem os jogos dele no clube) e alguns jogadores muito citados no exterior ficam acima. Para corrigir, edite o Wikidata ou ajuste
as constantes em `src/tools/wikidata/build.ts` e rode `npm run deck:wikidata -- --build`.

**Seleção.** Até 2 versões (clube/ano) por jogador; o leilão nunca põe duas versões da mesma pessoa juntas (`personId`).
A melhor versão de todo jogador no top 10% de fama entra sempre; o resto é estratificado por posição e faixa (para haver também
operários e pernas-de-pau), preferindo os nomes mais conhecidos. O baralho atual tem 935 cartas (≈10% Lendas).

**Imagens.** As figurinhas são ilustrações próprias, geradas no navegador (sem rosto), com as cores oficiais do clube quando o
Wikidata as tem (ou a tabela de cores dos principais clubes do script). Lendas ganham avatar maior com aro dourado, brilho e
coroa — só depois de reveladas (no martelo e na Cerimônia), para não entregar o nível durante o leilão às cegas.

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
      "kit": ["#E2001A", "#000000"]
    }
  ]
}
```

- `position`: `GOL` | `LAT` | `ZAG` | `MEI` | `ATA`; `tier`: `lenda` | `craque` | `titular` | `operario` | `perna`.
- `levelMin` ≤ `levelMax`, entre 1 e 99; `id` único e estável (usado no histórico e no reaproveitamento entre ciclos).
- Opcionais: `personId` (mesma pessoa em versões diferentes), `kit` (duas cores `#RRGGBB`).
- Para salas de 20 técnicos: ≥ 21 GOL, ≥ 41 LAT, ≥ 41 ZAG, ≥ 81 MEI e ≥ 61 ATA. Se faltar carta, o Monte completa com reservas genéricas.

## Baralho fictício
`npm run deck:generate` recria `data/deck.json` (320 cartas, determinístico). É usado nos testes e quando não há baralho real.
