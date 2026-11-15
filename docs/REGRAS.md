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

Prazos (modo normal): envelope 45 s, desempate 20 s, Monte 20 s, convocação 90 s (leilão de clubes), cerimônia 65 s (45 s + 20 s para
escolher os batedores de pênalti, falta e escanteio), rodada da liga 40 s, jogo de copa 40 s (o seu jogo passa no campinho: os 22
jogadores no gramado, a bola de pé em pé, com pênalti, falta, escanteio e impedimento). Modo turbo ≈ metade.
A duração da partida é escolha da sala (“Tempo de cada partida”: 20 ou 40 segundos), independente do ritmo do leilão; trocar o
ritmo para turbo põe 20 s, e dá para voltar a 40 s.

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

### Leilão de seleções (sala: “Tipo de leilão” → Seleções)
Igual ao leilão de clubes, mas cada lote é um **setor de uma seleção** (os atacantes do Brasil, os goleiros da Itália…).
- Só entra quem jogou pela seleção principal (15+ jogos ou Copa do Mundo), e de cada seleção só os melhores de cada setor:
  3 goleiros, 5 laterais, 5 zagueiros, 8 meias e 7 atacantes. Uma carta por jogador.
- Seleções no baralho (as que fecham todos os setores): Brasil, Argentina, Uruguai, México, Estados Unidos, Itália, Alemanha,
  França, Espanha, Inglaterra, Holanda, Portugal, Croácia, Sérvia, Suíça, Dinamarca e Irlanda. Com mais de 16 técnicos, os
  pacotes que faltarem saem “combinados” (jogadores de várias seleções).
- Lances, Monte, convocação, sobras e novo ciclo: como no leilão de clubes. As cartas de seleção não aparecem nos outros modos.
- Detalhes do baralho e dos escudos: `docs/BARALHO.md`.

## Liga e copas
- Liga: 20 times (técnicos + clubes do jogo), turno e returno, 3/1/0, critérios: pontos, vitórias, saldo, gols pró, sorteio prévio.
- Partida: cada jogador rende um valor sorteado dentro da sua faixa; ataque/meio/defesa geram médias de gols (Poisson):
  ~1,3 gol para cada lado entre times iguais (≈ 2,8 por jogo) e cada ponto de ataque acima da defesa rival vale ~3,5% de gols
  (10 pontos de diferença em tudo ≈ 2,2 × 0,75); mando +10%; Retranca (−4 ataque, +5 defesa), Ataque (+5 ataque, −4 defesa).
- Capitão: na cerimônia, junto dos batedores, cada técnico escolhe o capitão (sem escolha, o melhor do elenco). Ele aparece com
  o “C” no campinho e na escalação; não muda o resultado dos jogos.
- Bola parada: na cerimônia cada técnico escolhe quem bate pênalti, falta e escanteio (sem escolha, o jogo indica o melhor do elenco;
  CPU e clubes do jogo usam a indicação). A média de gols não muda — parte dos gols passa a nascer de bola parada:
  - **Pênalti:** raro (≈ 1 a cada 4 jogos) e quase sempre gol: 78% de acerto, de 66% a 90% conforme o batedor.
  - **Falta na entrada da área:** ≈ 1 por jogo; entra 30% das vezes (de 20% a 40% conforme o batedor). O resto para no goleiro, na
    barreira, na trave ou vai para fora.
  - **Escanteio:** ≈ 15% dos gols de bola rolando saem de escanteio, de cabeça, com assistência de quem cobrou.
  - Gol de pênalti ou de falta é de quem bateu e não tem assistência.
- Expulsão: rara — cada time tem 1,5% de chance por jogo (um vermelho a cada ~33 jogos), entre os 15 e os 85 minutos, mais para
  zagueiros, laterais e meias. O expulso sai do campinho e não faz mais gol nem dá passe; no tempo que resta, o time com um a menos
  cria até 30% menos e o adversário até 30% mais (proporcional ao tempo que falta). Não há suspensão para o jogo seguinte.
- Súmula: embaixo do nome de cada time, no placar do jogo ao vivo, aparecem os goleadores com o minuto — “(P)” para pênalti,
  “(Falta)” para falta direta — e os expulsos.
- Clubes do jogo (os que completam a liga): calibrados pela média dos elencos montados no leilão — as forças vão por igual de
  11 pontos abaixo até 1 ponto abaixo dessa média (na copa continental, de 9 abaixo a 1 acima). Em simulação de 40 temporadas
  com 4 técnicos: campeão com ~83 pontos, saldo ~+45 e ~6 derrotas; um clube do jogo é campeão em ~1 de cada 6 temporadas.
  (Antes eram fixos em 66–77, contra elencos de ~84 no leilão: o campeão fazia ~106 pontos e +140 de saldo.)
- Copa dos 8: G8 da liga; ida e volta (agregado e pênaltis), final única em campo neutro.
- Taça Continental: G8 + 24 clubes; 8 grupos de 4 (turno e returno); oitavas, quartas e semi em ida e volta; final única.
- Torneio Mundial: igual, mas grupos em turno único e mata-mata em jogo único.

Quando a liga termina, a sala festeja o campeão em tela cheia e abre um intervalo de 30 s (15 s no turbo) antes da copa. O anfitrião pode começar a copa na hora. O mata-mata aparece como chaveamento, da primeira fase até a final: quem passou fica em destaque e quem saiu fica apagado.
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
