#!/usr/bin/env node
// SMOKE_BASE_URL=<site> node scripts/smoke.mjs [--config f] [--out f] [--http]; exit 1 = a route failed, 2 = bad setup.
// --http skips the browser (and the flow); SMOKE_FLOW=0 skips only the flow.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STEPS = ['goto', 'fill', 'click', 'expectText', 'expectUrl'];
const BROWSER_STEPS = ['fill', 'click', 'expectText', 'expectUrl'];
const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const safePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');

export function validateConfig(c) {
  const errs = [];
  if (!c || !Array.isArray(c.routes) || !c.routes.length) errs.push('routes must be a non-empty array');
  for (const r of c?.routes || []) if (!safePath(r?.path)) errs.push(`route path "${r?.path}" must start with a single /`);
  for (const [i, s] of (c?.flow?.steps || []).entries()) {
    const keys = Object.keys(s);
    if (keys.length !== 1 || !STEPS.includes(keys[0])) errs.push(`flow step ${i + 1}: use one of ${STEPS.join(', ')}; got ${keys.join(',') || 'nothing'}`);
    else if (keys[0] === 'goto' && !safePath(s.goto)) errs.push(`flow step ${i + 1}: goto "${s.goto}" must start with a single /`);
  }
  return errs;
}

export function fetchDriver(base) {
  return {
    async goto(path) {
      const res = await fetch(new URL(path, base), { redirect: 'follow' });
      return { status: res.status, text: await res.text() };
    },
  };
}

export async function playwrightDriver(base, timeout = 30000) {
  let pw;
  try { pw = await import('playwright'); } catch {
    throw new Error('playwright is not installed here: npm i -D playwright && npx playwright install chromium');
  }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  return {
    async goto(path) {
      const res = await page.goto(new URL(path, base).href, { waitUntil: 'load' });
      return { status: res ? res.status() : 0, text: await page.innerText('body') };
    },
    fill: (sel, val) => page.fill(sel, val),
    click: (sel) => page.click(sel),
    text: () => page.innerText('body'),
    url: async () => page.url(),
    close: () => browser.close(),
  };
}

const expand = (s, env) => String(s).replace(/\$\{(\w+)\}/g, (_, k) => {
  if (env[k] === undefined || env[k] === '') throw new Error(`env ${k} is not set`);
  return env[k];
});

async function timed(name, fn) {
  const t = Date.now();
  let detail = '';
  try { detail = (await fn()) || ''; } catch (e) { detail = `FAIL ${e.message || e}`; }
  const ms = Date.now() - t;
  const ok = !detail.startsWith('FAIL');
  return { name, ok, ms, detail: ok ? detail : detail.slice(5) };
}

async function checkRoute(driver, r) {
  const t = Date.now();
  const res = await driver.goto(r.path);
  const want = r.status ?? 200;
  if (res.status !== want) throw new Error(`got ${res.status}, want ${want}`);
  for (const s of asList(r.expect)) if (!res.text.includes(s)) throw new Error(`missing text "${s}"`);
  const ms = Date.now() - t;
  if (r.maxMs && ms > r.maxMs) throw new Error(`took ${ms}ms, max ${r.maxMs}ms`);
  return String(res.status);
}

async function runStep(driver, s, env) {
  if (s.goto) {
    const res = await driver.goto(s.goto);
    if (res.status >= 400) throw new Error(`goto ${s.goto} got ${res.status}`);
  } else if (BROWSER_STEPS.some((k) => k in s) && !driver.fill) {
    throw new Error('flow steps need the browser driver (run without --http)');
  } else if (s.fill) await driver.fill(s.fill[0], expand(s.fill[1], env));
  else if (s.click) await driver.click(s.click);
  else if (s.expectText) {
    const want = expand(s.expectText, env);
    if (!(await driver.text()).includes(want)) throw new Error(`missing text "${want}"`);
  } else if (s.expectUrl && !(await driver.url()).includes(s.expectUrl)) throw new Error(`url is not ${s.expectUrl}`);
}

export async function runSmoke({ base, config, driver, env = process.env }) {
  const results = [];
  for (const r of config.routes) results.push(await timed(r.path, () => checkRoute(driver, r)));
  if (config.flow?.steps?.length && env.SMOKE_FLOW !== '0') {
    results.push(await timed(`flow ${config.flow.name || 'main'}`, async () => {
      for (const [i, s] of config.flow.steps.entries()) {
        try { await runStep(driver, s, env); } catch (e) { throw new Error(`step ${i + 1} ${Object.keys(s)[0]}: ${e.message}`); }
      }
    }));
  }
  const failed = results.filter((x) => !x.ok).length;
  return { base, at: new Date().toISOString(), ok: failed === 0, passed: results.length - failed, failed, total: results.length, ms: results.reduce((n, x) => n + x.ms, 0), results };
}

export const summaryLine = (r) => `smoke: ${r.passed}/${r.total} passed, ${r.failed} failed in ${r.ms}ms ${r.base}`;

const argOf = (argv, n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

async function main(argv) {
  const fail = (msg) => { console.error(`smoke: ${msg}`); process.exit(2); };
  const base = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(base)) fail('set SMOKE_BASE_URL to the http(s) site to check');
  const cfgFile = resolve(argOf(argv, 'config', 'scripts/smoke.routes.json'));
  if (!existsSync(cfgFile)) fail(`${cfgFile} not found; copy brain/scaffold/checks/smoke.routes.json`);
  let config;
  try { config = JSON.parse(readFileSync(cfgFile, 'utf8')); } catch (e) { fail(`${cfgFile}: ${e.message}`); }
  const errs = validateConfig(config);
  if (errs.length) fail(`${cfgFile}: ${errs.join('; ')}`);

  let driver;
  try { driver = argv.includes('--http') ? fetchDriver(base) : await playwrightDriver(base); } catch (e) { fail(e.message); }
  let r;
  try { r = await runSmoke({ base, config, driver }); } finally { await driver.close?.(); }
  for (const x of r.results) console.log(`${x.ok ? 'PASS' : 'FAIL'} ${x.name.padEnd(28)} ${x.detail} ${x.ms}ms`);
  console.log(summaryLine(r));
  writeFileSync(resolve(argOf(argv, 'out', '.smoke-last.json')), JSON.stringify(r, null, 2) + '\n');
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
