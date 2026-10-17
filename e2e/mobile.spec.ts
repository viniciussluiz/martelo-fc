import { expect, test } from '@playwright/test';
import { enterAsGuest, watchConsole } from './helpers';

test('no celular, o pregão cabe na tela sem rolagem horizontal', async ({ page }) => {
  const errors = watchConsole(page);
  await enterAsGuest(page, 'Celular FC');
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: /Partida rápida/ }).click();
  await expect(page.getByRole('button', { name: /Abrir o pregão/ })).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: /Abrir o pregão/ }).click();
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.getByLabel(/^Lance em/).first().fill('5');
  await expect(page.getByRole('button', { name: 'Lacrar envelope' })).toBeInViewport();
  expect(errors).toEqual([]);
});
