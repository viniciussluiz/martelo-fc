# Regras e políticas

## Leilão
| Regra | Valor padrão | Configurável |
|---|---|---|
| Clubes das cartas | Tudo (Séries A e B de 2026 + grandes da Europa) | sala: “Clubes das cartas” (Tudo, Séries A e B, Série A, Série B, Europa) |
| Moedas iniciais | 100 | `AuctionConfig.startingCoins` |
| Lote por posição | Σ vagas + metade das vagas (arredondando para cima, mínimo +1): 4 técnicos têm 6 goleiros, 12 laterais, 18 meias; nunca menor que as cartas herdadas do ciclo anterior | `lotExtra`, `lotExtraRatio` |
| Equilíbrio do lote | cada posição sai com ⅓ de bons (Lenda/Craque), ⅓ de médios (Titular) e ⅓ de ruins (Operário/Perna-de-pau), com **pelo menos uma Lenda** entre os bons; se o baralho da sala não tiver Lenda ou bons/ruins suficientes na posição (ex.: só Série B), completa com os de nível mais próximo | — |
| Tamanho da leva | até 12 cartas; levas do mesmo tamanho, cada uma com a mesma mistura de bons, médios e ruins | `batchSize` |
| Lances por técnico | ≤ vagas abertas na posição; soma ≤ saldo; inteiros ≥ 1 | — |
| Fechamento | maior lance leva e paga o próprio lance | — |
| Desempate | uma rodada às cegas (≥ valor empatado, ≤ moedas livres); depois sorteio | sala: “Desempate às cegas” |
| Revelação | pote crescente (soma dos lances) | — |
| Repescagem | sobras de cada posição, só para quem tem vaga | sala: “Repescagem” |
| Carta-surpresa | 35% das levas têm uma carta com nome oculto | sala: “Cartas-surpresa” |
| Monte Final | grátis, um por vez; quem tem mais vagas começa; escolha automática no prazo | — |

Prazos (modo normal): envelope 45 s, desempate 20 s, Monte 20 s, convocação 90 s (leilão de clubes), cerimônia 45 s, rodada da liga 20 s,
jogo de copa 20 s (o seu jogo passa no campinho, com a bola andando e entrando no gol nos gols). Modo turbo ≈ metade.

### Leilão de clubes (sala: “Tipo de leilão” → Clubes)
Inspirado no modo “Clubes” do Leilão Legends. Em vez de um jogador por lance, cada lote é um **setor de um clube** (ex.: os goleiros do
Corinthians) — um pacote.

| Regra | Valor |
|---|---|
| Baralho | sempre todos os clubes (Brasil e Europa), para cada setor ter pacotes diferentes |
| Pacotes por setor | técnicos + 1 (4 técnicos → 5 pacotes de goleiros, 5 de laterais…) |
| Tamanho do pacote | os jogadores do clube naquele setor (uma versão por pessoa), de 2 a 10; o mínimo é o que a formação mais exigente pede + 1 (goleiros 2, laterais 3, zagueiros 3, meias 5, atacantes 4); clubes maiores são cortados por sorteio |
| Mistura do lote | pacotes de clubes fortes, médios e fracos (terços pela força do pacote) e pelo menos um pacote com Lenda |
| Pessoa repetida | nunca aparece em dois pacotes do mesmo leilão |
| O que se vê no lance | escudo, clube, setor e quantos jogadores vêm; os nomes só aparecem na convocação, e o nível só na Cerimônia |
| Lances | um pacote por setor; soma ≤ saldo; maior lance leva o pacote inteiro (desempate, revelação e repescagem como no leilão de jogadores) |
| Monte Final | quem ficou sem pacote num setor escolhe, de graça, um dos pacotes que sobraram |
| Convocação | no fim do pregão, cada técnico escolhe quem joga dentro dos próprios pacotes, pela formação travada; quem não fecha a tempo recebe o **pior** jogador do pacote em cada vaga que faltou; a CPU convoca os que acha melhores |
| Preço de cada jogador | o preço do pacote dividido entre os convocados do setor (a sobra da divisão vai para os primeiros) |
| Quem sobra | os jogadores de pacote que ninguém escalou vão para os times do jogo na liga (no lugar dos jogadores inventados) |
| Novo ciclo | os pacotes são sorteados de novo (não há jogadores herdados); cartas-surpresa não existem neste modo |

### Sair da sala
Durante a disputa há um botão “Sair da sala” (com confirmação) no topo da tela. Quem sai deixa o time no automático: sem lances, e no
Monte e na convocação o jogo escolhe por ele; dá para voltar pelo código da sala e retomar o time. Se ninguém mais estiver jogando
(ou na partida rápida), a disputa termina sem resultado.

## Liga e copas
- Liga: 20 times (técnicos + clubes do jogo), turno e returno, 3/1/0, critérios: pontos, vitórias, saldo, gols pró, sorteio prévio.
- Partida: cada jogador rende um valor sorteado dentro da sua faixa; ataque/meio/defesa geram médias de gols (Poisson):
  ~1,3 gol para cada lado entre times iguais (≈ 2,8 por jogo) e cada ponto de ataque acima da defesa rival vale ~3,5% de gols
  (10 pontos de diferença em tudo ≈ 2,2 × 0,75); mando +10%; Retranca (−4 ataque, +5 defesa), Ataque (+5 ataque, −4 defesa).
- Clubes do jogo (os que completam a liga): calibrados pela média dos elencos montados no leilão — as forças vão por igual de
  11 pontos abaixo até 1 ponto abaixo dessa média (na copa continental, de 9 abaixo a 1 acima). Em simulação de 40 temporadas
  com 4 técnicos: campeão com ~83 pontos, saldo ~+45 e ~6 derrotas; um clube do jogo é campeão em ~1 de cada 6 temporadas.
  (Antes eram fixos em 66–77, contra elencos de ~84 no leilão: o campeão fazia ~106 pontos e +140 de saldo.)
- Copa dos 8: G8 da liga; ida e volta (agregado e pênaltis), final única em campo neutro.
- Taça Continental: G8 + 24 clubes; 8 grupos de 4 (turno e returno); oitavas, quartas e semi em ida e volta; final única.
- Torneio Mundial: igual, mas grupos em turno único e mata-mata em jogo único.
- Ranking do ciclo: número de títulos; depois posição na liga; depois fase da copa.

## Continuidade da sala (política explícita)
1. Ao terminar a copa, o resultado é gravado (transação idempotente) e a sala entra em `post_dispute`.
2. Todos os membros ativos que **não abandonaram** a disputa recebem a pergunta “continuar?”; quem entrou durante a disputa também vota.
3. Prazo configurável (`continuationTimeoutSec`, padrão 60 s online / 120 s solo). A votação fecha antes se todos responderem;
   o anfitrião pode iniciar já, se houver o mínimo de confirmados.
4. Resolução:
   - “Sair” → o membro deixa a sala.
   - Sem resposta → o membro fica **inativo** (fora do ciclo; pode voltar pelo código).
   - Confirmados ≥ `minHumansToContinue` (padrão 2 online, 1 solo) → nova disputa automática com eles + CPUs configuradas.
   - Entre 1 e o mínimo → a sala volta ao lobby, preservando histórico, esperando mais gente.
   - Ninguém → sala encerrada.
5. Novo ciclo: **todas** as cartas adquiridas no ciclo anterior (leilão, repescagem, desempate e Monte) entram no pool do novo leilão,
   completadas com cartas do baralho até o tamanho de cada lote — as novas vão para as faixas que ficaram abaixo de ⅓, e
   se nenhuma herdada da posição for Lenda, entra uma Lenda nova (mesmo que o lote fique uma carta maior).
   Moedas e elencos zeram. (Política desligável: “Reaproveitar jogadores”.)

## O que conta como confronto
Os números contra um adversário são calculados a partir de `confrontations`, separados por modalidade e **nunca somados**:

| Modalidade | Unidade | Vitória | Empate |
|---|---|---|---|
| ciclo | cada disputa concluída em comum | melhor ranking do ciclo | não existe |
| liga | cada liga em comum | posição superior | não existe |
| copa | cada copa em que os dois jogaram | fase mais avançada | mesma fase |
| partida | cada jogo direto (liga ou copa) | placar | placar igual (pênaltis não contam) |
| eliminatoria | cada mata-mata direto na copa | quem avançou | não existe |
| lance | cada carta disputada pelos dois e levada por um deles | quem levou | não existe |

Disputas com mais de dois técnicos geram um registro por par. Só contam disputas concluídas; quem abandonou fica de fora.
Aproveitamento: partidas usam (3V + E) / (3J); demais modalidades usam V / J.

## Conquistas
Catálogo em `src/server/services/achievements-catalog.ts` (30 conquistas, 7 categorias, 4 raridades, 3 secretas).
Cada item define `metric` + `target` sobre `UserStats`, calculado só a partir do histórico persistido. Para criar uma conquista nova
basta adicionar um item ao catálogo (ou uma métrica nova em `stats.ts`). A avaliação roda dentro da transação de finalização e é idempotente.

Trajetória do técnico (marcos de progressão, decisão própria no lugar do modo carreira): por disputa concluída,
20 pontos + 2 por posição acima do 20º + 40 pela liga + 30 pela copa + bônus pela fase da copa.
Níveis: Várzea (0), Série D (100), Série C (300), Série B (700), Série A (1300), Lenda do Apito (2200).
