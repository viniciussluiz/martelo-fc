# Investigação do jogo de referência (leilaolegends.com)

Investigação feita em 16/10/2026 pelo Chrome (extensão Claude in Chrome), na versão do site identificada no rodapé como `v2e7b7d4`.
Foi jogada uma **partida rápida completa** (leilão → cerimônia → liga de 38 rodadas → Copa dos 8 → tela final),
com 3 CPUs, baralho Brasileirão, formação 4-3-3. Nenhum mecanismo de autenticação ou proteção foi contornado; nada foi copiado
(código, textos, imagens ou identidade visual). Os textos abaixo são descrições próprias.

## 1. Comprovado por observação

**Tecnologia (observável no navegador)**
- SPA com elemento `#root` e um bundle `assets/index-*.js` + `index-*.css` (padrão Vite/React). Fontes Inter e Oswald. Anúncios AdSense.
- Durante a configuração da partida rápida não houve requisições de API de jogo (apenas recursos `data:`), o que sugere que o modo contra a CPU roda no cliente.
- O estado da partida sobrevive à recarga da página (a tela final reapareceu após navegar de novo para a raiz).

**Menu e modos**
- Partida rápida (contra a CPU), Jogar online (sala com código), Modo carreira, Loja, Salão dos batismos, Regras e Álbum (cartas/trocas).
- Configuração da partida: tipo de leilão (por jogador ou por setor de clube), baralho (Brasil, Europa ou os dois), o que vem depois da liga
  (Liga + Copa, Liga + Libertadores, só Champions, só Liga), modo do leilão (envelope cego ou “Tocaia”, preço descendente),
  formação 4-3-3 ou 4-4-2 travada antes do pregão, e 3/5/7/9 CPUs.

**Leilão (envelope cego)**
- Cada técnico começa com 100 moedas.
- Posições em sequência: GOL → LAT → ZAG → MEI → ATA.
- Tamanho do lote = soma das vagas da posição entre os técnicos + 1 (com 4 técnicos 4-3-3/4-4-2: 5 goleiros, 9 laterais, 14 meias).
- Lotes grandes são divididos em levas (14 meias vieram como leva de 12 + leva de 2).
- Cada técnico só pode dar lance em tantos jogadores quantas vagas abertas tiver na posição (os botões “+” dos demais ficam desabilitados).
- A soma dos lances do envelope não passa do saldo (indicador “envelope: X / saldo”). Prazo de 45 s; botão para lacrar antes.
- Vence o maior lance e paga o próprio lance (saldo caiu exatamente o valor ofertado).
- A revelação é feita carta a carta numa ordem chamada “pote crescente”, mostrando todos os lances e o vencedor; há mensagens para vitórias
  por margem pequena. Carta sem lance: “vai para o Monte”.
- Empate no maior lance dispara um desempate (mensagem de “ofertas empatadas… desempate”).
- Depois das levas de cada posição há uma **repescagem** das sobras, só para quem ainda tem vaga naquela posição.
- Existe carta-surpresa: o nome aparece oculto durante o lance e é revelado no martelo.
- Quem não completa o time pega jogadores de graça no **Monte Final**, na sua vez.

**Cerimônia, liga e copa**
- Na cerimônia aparecem as faixas de nível de cada jogador (ex.: “76–84”) e prêmios do pregão (melhor custo-benefício, pior compra,
  quem pagou mais acima do 2º lance, quem guardou mais moedas, pior titular). Contagem regressiva com opção de começar já.
- Liga com 20 times (técnicos da sala + clubes do jogo), 38 rodadas em ~3–4 minutos, placar ao vivo do jogo do usuário com narração,
  artilharia, faixas de classificação (8 primeiros e 4 últimos) e escolha de tática por jogo (Retranca / Equilíbrio / Ataque).
- Copa dos 8: 1º×8º, 2º×7º, 3º×6º, 4º×5º em ida e volta; semifinal ida e volta; final em jogo único.
- Tela final: tabela, artilharia, campeões, resumo em formato de jornal e opções para nova temporada, reiniciar, carreira ou novo pregão.

**Regras e perguntas frequentes (texto do próprio site)**
- Sala online com até 20 técnicos, entrada por código, sem conta; dá para começar com 2.
- Carta de álbum como prêmio para campeão da liga e da copa (inclusive contra a CPU), apenas para quem tem conta.
- Carreira em pirâmide (da várzea à Série A) com finanças, contratos, estádio etc.

## 2. Hipóteses técnicas (não confirmadas)
- “Pote crescente” = ordem crescente da **soma dos lances** de cada carta. Os dados observados são compatíveis
  (a carta com 4 lances somando 78 moedas foi a última da leva), mas a regra não está documentada.
- O desempate parece ser um novo lance às cegas entre os empatados; o critério final, se empatar de novo, não foi observado.
- Os níveis são faixas e o rendimento em cada jogo varia dentro delas.
- As CPUs estimam o valor dos nomes com algum ruído; a fórmula de lances não é observável.
- A simulação de partidas usa os níveis por setor; fórmula desconhecida.
- Os clubes extras da liga têm elencos próprios (um deles escalou jogador folclórico do baralho).

## 3. Não investigado / inacessível
- **Modo online real**: não foi criada sala para não interferir na conta e na sala aberta do usuário (`T718RC`). O fluxo foi inferido das regras do site.
- Modo carreira, loja/planos, álbum e trocas, batismos, leilão por clubes, modo Tocaia e formato “só Champions” (só as descrições foram lidas).
- Comportamento exato de desconexões e de salas após o fim (no modo rápido, as opções finais reiniciam do zero).

## 4. Decisões próprias desta implementação
- **Baralho fictício** gerado por semente (320 cartas, 5 faixas). O original usa jogadores reais; aqui não há dados de terceiros nem direito de imagem envolvido.
  O formato permite trocar por um baralho licenciado (docs/BARALHO.md). Como os nomes são fictícios, cada carta traz uma **pista** que se correlaciona com a faixa (60%).
- Fórmulas próprias e configuráveis: CPU (estimativa com ruído e orçamento por vaga), simulação (Poisson por setores + tática + mando), prêmios do pregão.
- Ordem do Monte: quem tem mais vagas escolhe primeiro; escolha automática por tempo.
- Desempate: uma rodada às cegas (lance ≥ ao empate, limitado às moedas livres); se empatar de novo, sorteio. Desligável.
- Formatos de copa: Copa dos 8 (observado), “Taça Continental” (inspirado na opção Libertadores) e “Torneio Mundial” (próprio). Nomes neutros para não usar marcas.
- Tudo o que é exclusivo deste projeto: continuidade de salas, histórico de confrontos, Sala de Troféus, trajetória do técnico.
- Identidade visual própria (papel frio, tinta azul-caneta, envelope com lacre, cartas com recorte de figurinha, Sala de Troféus escura com dourado),
  fontes OFL empacotadas (Big Shoulders Display, Public Sans, Kalam) e ícones desenhados para o projeto.
