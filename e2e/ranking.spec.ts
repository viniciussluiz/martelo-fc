import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('ranking aberto a quem não entrou: menu, temporada, geral e como funciona', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/regras');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Ranking' }).click();
  await expect(page).toHaveURL(/\/ranking$/);
  await expect(page.getByRole('heading', { name: 'Ranking', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Temporada', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('em andamento')).toBeVisible();
  await expect(page.getByText(/Ninguém pontuou nesta temporada ainda/)).toBeVisible();

  const how = page.locator('.ranking-how');
  await expect(how.getByText('Torneio Mundial')).toBeVisible();
  await expect(how.locator('li', { hasText: 'Taça Libertadores' })).toContainText('200');
  await expect(how.locator('li', { hasText: 'Copa dos 8' })).toContainText('50');

  await page.getByRole('button', { name: 'Geral', exact: true }).click();
  await expect(page).toHaveURL(/\/ranking\?temporada=geral$/);
  await expect(page.getByText('Todos os tempos', { exact: true })).toBeVisible();
  await expect(page.getByText(/Ninguém pontuou ainda/)).toBeVisible();

  // Só online: o período escolhido continua, e o filtro vai para o endereço.
  await page.getByRole('button', { name: 'Só online' }).click();
  await expect(page).toHaveURL(/\/ranking\?temporada=geral&online=1$/);
  await expect(page.getByText('Contam só as disputas com pelo menos 2 técnicos humanos na sala.')).toBeVisible();
  await page.getByRole('button', { name: 'Temporada', exact: true }).click();
  await expect(page).toHaveURL(/\/ranking\?online=1$/);
  expect(errors).toEqual([]);
});
