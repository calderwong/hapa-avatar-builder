#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/Users/calderwong/Desktop/hapa-dev-proto/node_modules/playwright/index.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:8807';
const output = path.resolve('outputs/shared-hand-header-visual-qa');
const routes = ['builder', 'mind', 'scenes', 'items', 'loops', 'lookbook', 'lore', 'songs', 'echos', 'kanban', 'protocol', 'bank', 'tarot-library', 'hell-week', 'tarot', 'creator-sets'];
const viewports = [[1920, 1080], [1440, 960], [1280, 800], [900, 900], [768, 900], [390, 844]];
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { schema: 'hapa.shared-hand-header-visual-qa.v1', baseUrl, generatedAt: new Date().toISOString(), routes: [], viewports: [], interaction: {} };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  for (const route of routes) {
    await page.goto(`${baseUrl}/?view=${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
    const result = await page.evaluate(() => {
      const header = document.querySelector('.topbar')?.getBoundingClientRect();
      const workspace = document.querySelector('.workspace')?.getBoundingClientRect();
      const hand = document.querySelector('.builder-header-hand')?.getBoundingClientRect();
      return {
        route: new URLSearchParams(location.search).get('view'),
        handMounted: Boolean(hand),
        handInHeader: Boolean(header && hand && hand.top >= header.top && hand.bottom <= header.bottom + 1),
        workspaceClear: Boolean(header && workspace && workspace.top >= header.bottom - 1),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (!result.handMounted || !result.handInHeader || !result.workspaceClear || result.horizontalOverflow) throw new Error(`Route ${route} failed: ${JSON.stringify(result)}`);
    report.routes.push(result);
  }

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/?view=tarot`, { waitUntil: 'domcontentloaded' });
    await page.locator('.builder-header-hand').waitFor();
    const metrics = await page.evaluate(() => {
      const header = document.querySelector('.topbar')?.getBoundingClientRect();
      const hand = document.querySelector('.builder-header-hand')?.getBoundingClientRect();
      const workspace = document.querySelector('.workspace')?.getBoundingClientRect();
      return { headerHeight: header?.height, handWidth: hand?.width, handInHeader: Boolean(header && hand && hand.top >= header.top && hand.bottom <= header.bottom + 1), workspaceClear: Boolean(header && workspace && workspace.top >= header.bottom - 1), horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    if (!metrics.handInHeader || !metrics.workspaceClear || metrics.horizontalOverflow) throw new Error(`Viewport ${width}x${height} failed: ${JSON.stringify(metrics)}`);
    const screenshot = path.join(output, `tarot-${width}x${height}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    report.viewports.push({ width, height, screenshot, ...metrics });
  }

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${baseUrl}/?view=tarot`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Detach' }).click();
  await page.locator('.hapa-overcard-hand.is-floating').waitFor();
  await page.locator('[data-overcard-host-target="builder-host:builder"]').first().click();
  const persistedAcrossRoute = await page.locator('.hapa-overcard-hand.is-floating').isVisible();
  await page.getByRole('button', { name: 'Dock', exact: true }).first().click();
  const returnedToHeader = await page.locator('.builder-header-hand .hapa-overcard-hand.is-docked').isVisible();
  await page.getByRole('button', { name: 'Manage' }).click();
  const managerVisible = await page.getByRole('dialog', { name: 'Manage Shared Hand, Decks, Sets, and Library' }).isVisible();
  report.interaction = { persistedAcrossRoute, returnedToHeader, managerVisible };
  if (!persistedAcrossRoute || !returnedToHeader || !managerVisible) throw new Error(`Interaction failed: ${JSON.stringify(report.interaction)}`);
} finally {
  await browser.close();
}
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, output, routes: report.routes.length, viewports: report.viewports.length, interaction: report.interaction }));
