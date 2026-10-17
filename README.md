# Martelo FC

Leilão às cegas de futebol para jogar com amigos ou contra a CPU: cada técnico tem 100 moedas e um envelope, dá lance no nome do jogador
sem ver o nível, monta o time e disputa liga e copa. Implementação independente inspirada nas mecânicas observáveis do Leilão Legends
(ver [docs/INVESTIGACAO.md](docs/INVESTIGACAO.md)), com três funcionalidades exclusivas:

- **Continuidade de salas** — ao fim da liga e da copa, todos veem o resumo e decidem se continuam; o próximo ciclo começa na mesma sala
  com todos os jogadores do ciclo anterior de volta ao pregão. Histórico preservado, sem início duplicado, desconexões tratadas.
- **Histórico de confrontos** — por adversário: ciclos, ligas, copas, partidas, mata-matas e disputas de lance, com aproveitamento,
  sequências, títulos e finais em comum, elencos e leilões de cada disputa, filtros por período e competição.
- **Sala de Troféus** — 30 conquistas orientadas a dados (raridades, categorias, secretas, progresso), validadas no servidor.

## Requisitos
- Node.js **20.11+** (testado com 22). Nenhum serviço externo; o banco é SQLite em arquivo.

## Instalar e rodar
```bash
npm install
npm run build        # compila o cliente para dist/
npm start            # servidor em http://localhost:3210 (aplica as migrações no boot)
```
Desenvolvimento com recarga: `npm run dev` (servidor em 3210 + Vite em http://localhost:5173 com proxy para /api e /ws).

Configuração por variáveis de ambiente — ver [.env.example](.env.example). Não há segredos.

## Banco e migrações
As migrações SQL ficam em `migrations/` e são aplicadas automaticamente no boot. Para aplicar manualmente:
```bash
DATABASE_PATH=./data/martelo.db npm run migrate
```

## Testes
```bash
npm run typecheck    # TypeScript estrito em todo o projeto
npm test             # Vitest: regras (engine) + integração (servidor, SQLite e WebSocket reais)
npm run build && npm run test:e2e   # Playwright: navegador real (solo, sala com 2 navegadores, mobile)
npm run test:all     # tudo acima em sequência
```
O Playwright usa o Chromium do pacote `@playwright/test` (`npx playwright install chromium` se ainda não tiver).
Os testes sobem servidores próprios com banco temporário e ritmo acelerado (`GAME_SPEED=test`/`e2e`).

## Documentação
- [docs/INVESTIGACAO.md](docs/INVESTIGACAO.md) — o que foi observado no original, hipóteses, o que ficou inacessível e decisões próprias.
- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — módulos, modelo de dados, estados, concorrência, tempo real, segurança.
- [docs/REGRAS.md](docs/REGRAS.md) — regras do leilão, liga e copas; política de continuidade; definição de confronto; conquistas.
- [docs/BARALHO.md](docs/BARALHO.md) — formato do baralho para trocar pelo seu conjunto de dados.

## Créditos e licenças de ativos
Código, textos, ícones, nomes de clubes e jogadores do baralho padrão são próprios (fictícios).
Fontes empacotadas via Fontsource sob SIL Open Font License: Big Shoulders Display, Public Sans e Kalam.
