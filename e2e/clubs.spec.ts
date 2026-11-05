import { expect, test } from '@playwright/test';
import { enterAsGuest, playUntil, watchConsole } from './helpers';

test('leilão de clubes: pacotes às cegas, convocação, liga e saída da partida', async ({ page }) => {
  const errors = watchConsole(page);
  await enterAsGuest(page, 'Clubes E2E');
  await page.getByRole('button', { name: /Partida rápida/ }).click();
  await expect(page.getByRole('heading', { name: 'Partida rápida' })).toBeVisible();
  // Campos do formulário não viram campo de futebol.
  await expect(page.locator('.squad-field')).toHaveCount(0);
  const tipo = page.getByRole('group', { name: 'Tipo de leilão' });
  await expect(tipo.getByRole('button', { name: 'Jogador' })).toHaveAttribute('aria-pressed', 'true');
  await tipo.getByRole('button', { name: /Clubes/ }).click();
  await expect(page.getByText(/Cada lote é o setor de um clube/)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Clubes das cartas' })).toHaveCount(0);
  await page.getByRole('button', { name: /Abrir o pregão/ }).click();

  // Lote de goleiros: 4 técnicos → 5 pacotes, só clube e tamanho (nenhum nome de jogador).
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  await expect(page.locator('.lot .sticker.pack')).toHaveCount(5);
  await expect(page.locator('.lot .sticker-name')).toHaveCount(0);
  await expect(page.locator('.lot .pack-meta').first()).toHaveText(/^\d+ jogador(es)? no pacote/);
  const inputs = page.getByLabel(/^Lance em/);
  await inputs.first().fill('7');
  await expect(page.getByText('Lance em 1 pacote.')).toBeVisible();
  // Um pacote por setor: os outros campos travam.
  await expect(inputs.nth(1)).toBeDisabled();
  await page.getByRole('button', { name: 'Lacrar envelope' }).click();
  await expect(page.getByText(/Revelação \d+ de \d+/)).toBeVisible();

  // Até a convocação.
  await playUntil(page, async () => (await page.locator('.convoca').count()) > 0, 150_000, { ready: false, convoke: false });
  await expect(page.getByText(/Se o tempo acabar, entra o/)).toBeVisible();
  const fechar = page.getByRole('button', { name: 'Fechar convocação' });
  await expect(fechar).toBeDisabled();
  // Marca um a um; o setor completo passa sozinho para o próximo.
  for (let i = 0; i < 40 && !(await fechar.isEnabled()); i++) {
    const box = page.locator('.convoca-row input:not(:checked):not([disabled])').first();
    if (await box.count()) await box.check();
    else await page.locator('.convoca .tabs [role=tab]:not([data-done])').first().click();
  }
  await expect(page.locator('.convoca-count')).toContainText('11/11');
  await expect(page.locator('.convoca .squad-field .field-name')).toHaveCount(11);
  await fechar.click();

  // Cerimônia: 11 convocados com faixa e preço; depois a liga.
  await expect(page.getByText('O pregão em números')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.squad-field .field-name')).toHaveCount(11);
  await page.getByRole('button', { name: 'Estou pronto' }).click();
  await expect(page.getByText(/Liga · rodada/)).toBeVisible();

  // Sair da partida: confirmação, depois volta ao início.
  await page.getByRole('button', { name: 'Sair da partida' }).click();
  await expect(page.getByText(/a disputa termina aqui/)).toBeVisible();
  await page.getByRole('button', { name: 'Ficar' }).click();
  await expect(page.getByText(/a disputa termina aqui/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair da partida' }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: /Partida rápida/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');

  expect(errors.filter((e) => !/favicon|escudo|ERR_/i.test(e))).toEqual([]);
});
