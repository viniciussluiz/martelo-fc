import { expect, type Page } from '@playwright/test';

/** Coleta erros de console e exceções da página. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function enterAsGuest(page: Page, team: string) {
  await page.goto('/');
  await page.getByLabel('Nome do time').fill(team);
  await page.getByRole('button', { name: 'Entrar no pregão' }).click();
  await expect(page.getByRole('button', { name: /Partida rápida/ })).toBeVisible();
}

/**
 * Joga pela interface até `done()` ser verdadeiro: escreve um lance no primeiro
 * jogador disponível, lacra, resolve desempates, escolhe no Monte e confirma a cerimônia.
 */
export async function playUntil(page: Page, done: () => Promise<boolean>, timeoutMs = 150_000, opts: { ready?: boolean } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await done()) return;
    const seal = page.getByRole('button', { name: 'Lacrar envelope' });
    if ((await seal.count()) && (await seal.isEnabled().catch(() => false))) {
      const input = page.getByLabel(/^Lance em/).first();
      if ((await input.count()) && (await input.isEnabled().catch(() => false))) {
        await input.fill('3', { timeout: 1000 }).catch(() => undefined);
        await page.waitForTimeout(60);
      }
      await seal.click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const tb = page.getByRole('button', { name: 'Lacrar desempate' });
    if (await tb.count()) {
      await tb.click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const pick = page.locator('.monte-grid button.sticker:not([disabled])');
    if (await pick.count()) {
      await pick.first().click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    const ready = page.getByRole('button', { name: 'Estou pronto' });
    if (opts.ready !== false && (await ready.count())) {
      await ready.click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('playUntil: tempo esgotado');
}

export const continuationVisible = (page: Page) => async () => (await page.getByRole('heading', { name: /Mais uma na mesma sala/ }).count()) > 0;
