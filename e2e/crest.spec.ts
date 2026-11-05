import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('criador de escudos: monta ao fundar o clube, troca depois e o escudo aparece na sala', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/');
  await page.getByLabel('Nome do time').fill('Escudo FC');
  // Monta o escudo antes de entrar: formato redondo, leão, três estrelas e faixa.
  await page.getByRole('group', { name: 'Formato' }).getByRole('button', { name: 'Redondo' }).click();
  await page.getByRole('tab', { name: 'Símbolo' }).click();
  await page.getByRole('button', { name: 'Leão' }).click();
  await expect(page.getByRole('button', { name: 'Leão' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Enfeites' }).click();
  await page.getByRole('button', { name: '3 estrelas' }).click();
  await page.getByRole('button', { name: 'Entrar no pregão' }).click();

  // O escudo ficou salvo na conta.
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem('martelo.token');
    const r = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
    return (await r.json()).user.crest;
  });
  expect(me).toMatchObject({ shape: 'redondo', symbol: 'leao', stars: 3 });

  // Troca a cor pela janela do criador e salva.
  await page.getByRole('button', { name: /Editar escudo/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Cores' }).click();
  await dialog.getByRole('button', { name: 'Alviverde' }).click();
  await dialog.getByRole('button', { name: 'Salvar escudo' }).click();
  await expect(page.getByText('Escudo salvo')).toBeVisible();
  await expect(dialog).toBeHidden();

  // Na sala, o seu time aparece com o escudo (e as CPUs com os delas).
  await page.getByRole('button', { name: /Partida rápida/ }).click();
  await expect(page.getByRole('heading', { name: 'Partida rápida' })).toBeVisible();
  await expect(page.locator('.locker li .crest')).toHaveCount(4);
  const saved = await page.evaluate(async () => {
    const token = localStorage.getItem('martelo.token');
    const r = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
    return (await r.json()).user.crest;
  });
  expect(saved).toMatchObject({ primary: '#2E8B3A', secondary: '#FFFFFF', detail: '#FFC81E', symbol: 'leao' });
  expect(errors).toEqual([]);
});
