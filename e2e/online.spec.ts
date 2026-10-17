import { expect, test } from '@playwright/test';
import { continuationVisible, enterAsGuest, playUntil, watchConsole } from './helpers';

test('sala com amigos: convite, ciclo completo, continuidade e histórico de confrontos', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const hostErrors = watchConsole(host);
  const guestErrors = watchConsole(guest);

  await enterAsGuest(host, 'Anfitrião FC');
  await host.getByRole('button', { name: /Sala com amigos/ }).click();
  const plate = host.locator('.code-plate');
  await expect(plate).toBeVisible();
  const code = (await plate.textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await host.getByLabel('CPUs no pregão').selectOption('1');

  // O convidado abre o link da sala sem conta: escolhe o nome e cai na sala.
  await guest.goto(`/sala/${code}`);
  await expect(guest.getByText(`Você foi chamado para a sala ${code}`)).toBeVisible();
  await guest.getByLabel('Nome do time').fill('Visitante EC');
  await guest.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(guest.getByText('Esperando o anfitrião abrir o pregão.')).toBeVisible();
  await expect(host.getByText('Visitante EC')).toBeVisible();
  // Só o anfitrião muda regras.
  await expect(guest.getByLabel('CPUs no pregão')).toBeDisabled();

  await host.getByRole('button', { name: /Abrir o pregão/ }).click();
  await expect(guest.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();

  await Promise.all([playUntil(host, continuationVisible(host)), playUntil(guest, continuationVisible(guest))]);

  // Votação de continuidade visível para os dois.
  await guest.getByRole('button', { name: 'Continuar na sala' }).click();
  await expect(host.locator('.votes li', { hasText: 'Visitante EC' }).getByText('continua')).toBeVisible();
  await host.getByRole('button', { name: 'Continuar na sala' }).click();
  await expect(host.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Lacrar envelope' })).toBeVisible();

  // Histórico de confrontos: o anfitrião vê o adversário e o detalhe.
  await host.getByRole('link', { name: 'Perfil' }).click();
  await expect(host.getByRole('heading', { name: 'Anfitrião FC' })).toBeVisible();
  const opp = host.locator('.opp-list a', { hasText: 'Visitante EC' });
  await expect(opp).toBeVisible();
  await opp.click();
  await expect(host.getByRole('heading', { name: 'Anfitrião FC × Visitante EC' })).toBeVisible();
  const ciclos = host.locator('.stat', { hasText: 'Ciclos' });
  await expect(ciclos.getByText(/^(1–0–0|0–0–1)$/)).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Disputas em comum' })).toBeVisible();
  await expect(host.locator('article.panel')).toHaveCount(1);
  // Filtro por competição esconde ciclos e lances.
  await host.getByRole('button', { name: 'Liga', exact: true }).click();
  await expect(host.locator('.stat', { hasText: 'Ciclos' })).toHaveCount(0);

  expect(hostErrors).toEqual([]);
  expect(guestErrors).toEqual([]);
  await hostCtx.close();
  await guestCtx.close();
});
