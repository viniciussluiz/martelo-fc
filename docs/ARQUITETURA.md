# Arquitetura

```
src/
  engine/   Regras puras e determinísticas (sem I/O). Compartilhado por servidor e testes.
            rng · deck-generator · auction · cpu · awards · match · league · cup · bots · dispute
  shared/   Contrato servidor ⇄ cliente (tipos de mensagens e visões).
  server/   Node + HTTP + WebSocket (ws) + SQLite (better-sqlite3).
            app (rotas e WS) · auth · db (migrações) · rooms/ (ator da sala, visões, ritmo)
            services/ (resultados, estatísticas, confrontos, conquistas, perfil)
  web/      React 19 + Vite. lib/ (store, socket, api, router) · pages/ · components/
migrations/ SQL versionado (aplicado automaticamente no boot ou com `npm run migrate`).
data/       deck.json (baralho padrão) e o banco SQLite (padrão data/martelo.db).
tests/      Vitest: engine/ (regras) e server/ (integração com banco + WebSocket reais).
e2e/        Playwright: fluxos de navegador (solo, sala online com dois navegadores, mobile).
```

## Princípios
- **Servidor autoritativo.** O cliente só envia intenções (`bid:set`, `monte:pick`, `continue:vote`…); o servidor valida tudo no motor e
  devolve uma **visão personalizada**: lances alheios só aparecem na revelação e faixas de nível só na Cerimônia.
- **Motor puro e determinístico.** Toda aleatoriedade vem de um RNG com semente; o estado de uma disputa é JSON serializável. Isso permite
  testes reprodutíveis e restauração após reinício do servidor.
- **Um ator por sala.** Cada sala é um objeto (`RoomActor`) que concentra estado, temporizadores e transições; como o Node é single-thread,
  as ações de uma sala são processadas em série. O banco reforça a consistência (compare-and-set e restrições UNIQUE).

## Sala persistente × disputa individual

| Conceito | Tabela | Vida útil |
|---|---|---|
| Sala | `rooms`, `room_members` | Persiste entre ciclos (código, anfitrião, regras, membros, `cycle`). |
| Disputa (ciclo) | `disputes` | Uma por ciclo: `id` UUID, `seq` (1, 2, 3…), `UNIQUE(room_id, seq)`, `previous_dispute_id`. |
| Dado operacional | `disputes.state_json` | Snapshot do motor enquanto a disputa está ativa; **apagado** ao terminar. |
| Dado histórico | `result_json`, `dispute_participants`, `dispute_rosters`, `matches`, `confrontations`, `user_achievements` | Nunca é apagado. |

O próximo leilão lê as cartas compradas do **histórico** (`dispute_rosters` da disputa anterior) e cria um novo estado operacional do zero
(moedas 100, elencos vazios).

### Estados

```
Sala:     lobby ──start──▶ in_dispute ──fim──▶ post_dispute ──┬─ ≥ mínimo ─▶ in_dispute (seq+1)
            ▲                   │                              ├─ 1..mínimo-1 ─▶ lobby
            └──── aborto ───────┘                              └─ ninguém ─▶ closed

Disputa:  auction ─▶ ceremony ─▶ league ─▶ cup ─▶ finished      (ou aborted)
Leilão:   [GOL leva…, repescagem] → [LAT…] → [ZAG…] → [MEI…] → [ATA…] → Monte Final
          cada passo: lance (envelope) → desempate (se houver) → revelação
```

## Finalização (integração entre módulos)
`ResultsService.finalizeDispute` roda numa **única transação**:
1. `processed_events('finalize:<id>')` — se já existir, retorna sem fazer nada (idempotência contra retentativas e mensagens duplicadas);
2. `UPDATE disputes SET status='finished' … WHERE status='active'` (CAS) e descarte do snapshot;
3. grava participantes, elencos e partidas com humanos;
4. grava confrontos por par de usuários (`UNIQUE(dispute_id, kind, ref, user_a, user_b)`, `user_a < user_b`);
5. avalia conquistas a partir do histórico persistido (`INSERT OR IGNORE`, chave `(user_id, achievement_id)`).
Depois disso a sala abre a votação de continuidade e notifica os desbloqueios em tempo real.

## Concorrência e falhas
- **Início duplicado de ciclo:** `UPDATE rooms … WHERE cycle = ? AND status IN (…)` + `UNIQUE(room_id, seq)` + votação marcada como resolvida.
- **Mensagens atrasadas:** todo lance carrega o `stepId`; lances para um passo já fechado são recusados.
- **Desconexão:** o tempo do passo corre; envelopes valem como estão no prazo; no Monte a escolha é automática. Ao voltar, o cliente recebe o estado completo.
- **Ninguém conectado:** a disputa pausa (temporizadores congelados) e é encerrada sem resultado depois de `ABANDON_AFTER_MIN`.
- **Saída voluntária no meio:** o time segue no piloto automático e o técnico fica fora de confrontos e conquistas daquele ciclo; se todos saem, a disputa é abortada.
- **Reinício do servidor:** salas abertas são recarregadas; disputas ativas voltam do snapshot, pausadas até alguém reconectar.

## Tempo real
WebSocket em `/ws`. Primeira mensagem: `hello` com o token de sessão. Cada ação pode ter `reqId` e recebe `ack` ou `error`.
O servidor envia `room:state` (visão completa e personalizada) a cada mudança — simples, robusto a perdas de mensagem e a reconexões.
O cliente sincroniza o relógio pelo `serverTime` para as contagens regressivas.

## Segurança
Senhas com scrypt; token de sessão aleatório (só o hash SHA-256 fica no banco); limite de taxa nas rotas de autenticação e no WebSocket;
validação de todas as entradas; cabeçalhos CSP/`nosniff`/`frame-ancestors`; nomes de time sanitizados; estatísticas e conquistas
calculadas só no servidor.
