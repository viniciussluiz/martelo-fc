import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Capitão: escolhido na cerimônia, junto dos batedores, e marcado na escalação do jogo. */
let env: TestEnv;
beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

describe('capitão do time', () => {
  it('o técnico dá a braçadeira na cerimônia e ela aparece na escalação do jogo; os outros times têm o capitão do jogo', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Capitã');
    const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3 } }, ana.token);
    await ana.send({ t: 'room:join', code: data.code });
    await ana.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
    await ana.send({ t: 'room:start' });
    const ceremony = await ana.waitFor((r) => r?.dispute?.phase === 'ceremony', 60_000, 'cerimônia');
    const d = ceremony!.dispute!;
    const me = d.participants.find((p) => p.id === d.you)!;
    // Sem escolha, o jogo já indica um capitão do próprio elenco.
    expect(me.roster.some((r) => r.cardId === d.setPieces!.capitao)).toBe(true);
    const keeper = me.roster.find((r) => r.position === 'GOL')!.cardId;
    await expect(ana.send({ t: 'setpieces', takers: { capitao: 'carta-de-outro-time' } })).rejects.toThrow(/capitão/);
    await ana.send({ t: 'setpieces', takers: { capitao: keeper } });
    await ana.waitFor((r) => r?.dispute?.setPieces?.capitao === keeper, 5000, 'capitão');
    // A cerimônia fecha sozinha; a partir da 3ª rodada a braçadeira nova já vale com certeza.
    const league = await ana.waitFor((r) => (r?.dispute?.league?.round ?? 0) >= 3 && !!r?.dispute?.league?.myLastMatch?.lineups, 30_000, 'liga');
    const m = league!.dispute!.league!.myLastMatch!;
    for (const side of ['home', 'away'] as const) expect(m.lineups![side].filter((p) => p.captain)).toHaveLength(1);
    const mySide = m.homeId === d.you ? 'home' : 'away';
    expect(m.lineups![mySide].find((p) => p.captain)!.cardId).toBe(keeper);
    ana.close();
  }, 120_000);
});
