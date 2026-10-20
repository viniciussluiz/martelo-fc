import { expect, test } from '@playwright/test';
import { SERIES_CLUBS } from '../src/tools/wikidata/series';
import { continuationVisible, enterAsGuest, playUntil, watchConsole } from './helpers';

test('partida rápida completa, continuidade na mesma sala e Sala de Troféus', async ({ page }) => {
  const errors = watchConsole(page);
  await enterAsGuest(page, 'Solo E2E');
  await page.getByRole('button', { name: /Partida rápida/ }).click();
  await expect(page.getByRole('heading', { name: 'Partida rápida' })).toBeVisible();
  // Escolhe a formação e a copa antes do pregão.
  await page.getByRole('button', { name: '4-4-2' }).click();
  await expect(page.getByText('4 meias e 2 atacantes')).toBeVisible();
  await page.getByRole('button', { name: 'Torneio Mundial' }).click();
  await expect(page.getByText('Grupos em turno único')).toBeVisible();
  // Clubes das cartas: por padrão tudo (Brasil + Europa); aqui, só a Série A.
  const clubs = page.getByRole('group', { name: 'Clubes das cartas' });
  await expect(clubs.getByRole('button', { name: 'Tudo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await clubs.getByRole('button', { name: 'Série A', exact: true }).click();
  await expect(clubs.getByRole('button', { name: 'Série A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ver clubes' }).click();
  await expect(page.getByText(/Flamengo · /)).toBeVisible();
  await page.getByRole('button', { name: /Abrir o pregão/ }).click();

  // Leilão: envelope com validação no cliente.
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  // Só clubes da Série A no pregão.
  const serieA = new Set(SERIES_CLUBS.filter((c) => c.series === 'A').map((c) => c.name));
  const shown = (await page.locator('.sticker-meta .club-name').allInnerTexts()).map((t) => t.trim());
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.filter((c) => !serieA.has(c))).toEqual([]);
  // Cada clube aparece com o selo ao lado do nome.
  expect(await page.locator('.sticker-meta .club-badge').count()).toBe(shown.length);
  const inputs = page.getByLabel(/^Lance em/);
  await inputs.first().fill('150');
  await expect(page.getByText('Passou das suas moedas.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeDisabled();
  await inputs.first().fill('9');
  await expect(page.getByText('1 lance de 1 possíveis')).toBeVisible();
  // Com uma vaga de goleiro, o segundo campo fica bloqueado.
  await expect(inputs.nth(1)).toBeDisabled();
  await page.getByRole('button', { name: 'Lacrar envelope' }).click();
  await expect(page.getByText(/Revelação \d+ de \d+/)).toBeVisible();

  await playUntil(page, async () => (await page.getByText(/Cerimônia da Revelação/).count()) > 0, 150_000, { ready: false });
  await expect(page.getByText('O pregão em números')).toBeVisible();
  await page.getByRole('button', { name: 'Estou pronto' }).click();
  await expect(page.getByText(/Liga · rodada/)).toBeVisible();
  await page.getByRole('button', { name: 'Ataque' }).click();
  await expect(page.getByRole('button', { name: 'Ataque' })).toHaveAttribute('aria-pressed', 'true');

  await playUntil(page, continuationVisible(page));
  await expect(page.getByText('Ciclo 1 encerrado')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ranking do ciclo' }).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText('Histórico da sala')).toBeVisible();

  // Continua na mesma sala: novo ciclo com os jogadores de volta ao pregão.
  const url = page.url();
  await page.getByRole('button', { name: 'Continuar na sala' }).click();
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole('link', { name: 'Troféus' }).click();
  await expect(page.getByRole('heading', { name: 'Sala de Troféus' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bateu o Martelo: conquistada/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bloqueadas' }).click();
  await expect(page.getByRole('button', { name: /Bateu o Martelo/ })).toHaveCount(0);

  // Voltar para a sala em andamento a partir do início.
  await page.getByRole('link', { name: 'Jogar' }).click();
  await page.getByRole('button', { name: 'Voltar para a sala' }).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.scoreboard')).toBeVisible();
  expect(errors).toEqual([]);
});
