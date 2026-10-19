# Regras e políticas

## Leilão
| Regra | Valor padrão | Configurável |
|---|---|---|
| Clubes das cartas | Tudo (Séries A e B de 2026 + grandes da Europa) | sala: “Clubes das cartas” (Tudo, Séries A e B, Série A, Série B, Europa) |
| Moedas iniciais | 100 | `AuctionConfig.startingCoins` |
| Lote por posição | Σ vagas + 1 (nunca menor que as cartas herdadas do ciclo anterior) | `lotExtra` |
| Tamanho da leva | 12 cartas | `batchSize` |
| Lances por técnico | ≤ vagas abertas na posição; soma ≤ saldo; inteiros ≥ 1 | — |
| Fechamento | maior lance leva e paga o próprio lance | — |
| Desempate | uma rodada às cegas (≥ valor empatado, ≤ moedas livres); depois sorteio | sala: “Desempate às cegas” |
| Revelação | pote crescente (soma dos lances) | — |
| Repescagem | sobras de cada posição, só para quem tem vaga | sala: “Repescagem” |
| Carta-surpresa | 35% das levas têm uma carta com nome oculto | sala: “Cartas-surpresa” |
| Monte Final | grátis, um por vez; quem tem mais vagas começa; escolha automática no prazo | — |

Prazos (modo normal): envelope 45 s, desempate 20 s, Monte 20 s, cerimônia 45 s, rodada da liga 4,5 s, jogo de copa 6 s. Modo turbo ≈ metade.

## Liga e copas
- Liga: 20 times (técnicos + clubes do jogo), turno e returno, 3/1/0, critérios: pontos, vitórias, saldo, gols pró, sorteio prévio.
- Partida: cada jogador rende um valor sorteado dentro da sua faixa; ataque/meio/defesa geram médias de gols (Poisson);
  mando +12%; Retranca (−4 ataque, +5 defesa), Ataque (+5 ataque, −4 defesa).
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
   completadas com cartas do baralho até o tamanho de cada lote. Moedas e elencos zeram. (Política desligável: “Reaproveitar jogadores”.)

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
