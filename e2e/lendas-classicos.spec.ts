import { expect, test } from '@playwright/test';
import { enterAsGuest, playUntil, watchConsole } from './helpers';

test('leilão de lendas: carta a carta, sem escolha de clubes, até a liga', async ({ page }) => {
  const errors = watchConsole(page);
  await enterAsGuest(page, 'Lendas E2E');
  await page.getByRole('button', { name: /Single player/ }).click();
  const tipo = page.getByRole('group', { name: 'Tipo de leilão' });
  await tipo.getByRole('button', { name: 'Lendas' }).click();
  await expect(tipo.getByRole('button', { name: 'Lendas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/com as Lendas de todos os clubes/)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Clubes das cartas' })).toHaveCount(0);
  // Leilão carta a carta: as cartas-surpresa e as herdadas continuam na sala.
  await expect(page.getByText('Cartas-surpresa (nome escondido)')).toBeVisible();
  await page.getByRole('button', { name: /Abrir o pregão/ }).click();

  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  await expect(page.locator('.auction-head .sb-sub')).toContainText('Leilão de lendas');
  await expect(page.locator('.lot .sticker.pack')).toHaveCount(0);
  expect(await page.locator('.lot .sticker-name').count()).toBeGreaterThan(0);

  await playUntil(page, async () => (await page.getByText(/Liga · rodada/).count()) > 0, 170_000);
  expect(errors.filter((e) => !/favicon|escudo|ERR_/i.test(e))).toEqual([]);
});

test('leilão de clássicos: pacotes de clássico com os dois escudos, convocação e liga', async ({ page }) => {
  const errors = watchConsole(page);
  await enterAsGuest(page, 'Clássicos E2E');
  await page.getByRole('button', { name: /Single player/ }).click();
  const tipo = page.getByRole('group', { name: 'Tipo de leilão' });
  await tipo.getByRole('button', { name: 'Clássicos' }).click();
  await expect(page.getByText(/Cada lote é o setor de um clássico/)).toBeVisible();
  await expect(page.getByText(/sorteia 18 clássicos/)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Clubes das cartas' })).toHaveCount(0);
  // Sem limite de técnicos: com 9 CPUs o pregão abre do mesmo jeito.
  await page.getByLabel('CPUs no pregão').selectOption('9');
  await expect(page.getByRole('button', { name: /Abrir o pregão/ })).toBeEnabled();
  await page.getByLabel('CPUs no pregão').selectOption('3');
  await page.getByRole('button', { name: /Abrir o pregão/ }).click();

  // Goleiros: 4 técnicos → 5 pacotes, cada um de um clássico, com os dois clubes embaixo do nome.
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  await expect(page.locator('.auction-head .sb-sub')).toContainText('Leilão de clássicos');
  await expect(page.locator('.lot .sticker.pack')).toHaveCount(5);
  await expect(page.locator('.lot .pack-clubs')).toHaveCount(5);
  for (const text of await page.locator('.lot .pack-clubs').allTextContents()) expect(text).toMatch(/^.+ x .+$/);
  await expect(page.locator('.lot .pack-crests').first().locator('.club-badge')).toHaveCount(2);

  // Na convocação, cada jogador mostra o escudo do seu clube.
  await playUntil(page, async () => (await page.locator('.convoca').count()) > 0, 150_000, { ready: false, convoke: false });
  await expect(page.locator('.convoca-row .club-badge').first()).toBeVisible();
  await playUntil(page, async () => (await page.getByText(/Liga · rodada/).count()) > 0, 150_000);
  expect(errors.filter((e) => !/favicon|escudo|ERR_/i.test(e))).toEqual([]);
});
