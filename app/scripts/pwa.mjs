// PWA check on the built app: files, head tags, service worker, and opening offline.
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
const out = [];
const html = readFileSync('dist/index.html', 'utf8');
for (const f of ['manifest.webmanifest', 'sw.js', '_headers', '_redirects', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
  out.push(`file ${f}: ${existsSync('dist/' + f)}`);
for (const t of ['rel="manifest"', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title" content="Trainer"', 'viewport-fit=cover', 'rel="apple-touch-icon"', 'background-color: #0E0F10', '_expo/static/js/web/entry-'])
  out.push(`head ${t}: ${html.includes(t)}`);
const man = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
out.push(`manifest: ${man.name} / ${man.short_name} / ${man.display} / icons ${man.icons.map(i => i.sizes + (i.purpose === 'maskable' ? 'm' : '')).join(',')}`);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4000/', { waitUntil: 'networkidle' });
const sw = await p.evaluate(async () => {
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 8000))]);
  return r ? r.active?.state : 'no sw';
});
out.push('sw state: ' + sw);
await p.reload({ waitUntil: 'networkidle' });
out.push('controlled: ' + (await p.evaluate(() => !!navigator.serviceWorker.controller)));
out.push('caches: ' + JSON.stringify(await p.evaluate(async () => {
  const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname).slice(0, 8); return o;
})));
const mf = await p.evaluate(async () => { const r = await fetch('/manifest.webmanifest'); return r.status + ' ' + (await r.text()).slice(0, 30); });
out.push('manifest fetch: ' + mf);
await ctx.setOffline(true);
await p.goto('http://localhost:4000/gym/abc', { waitUntil: 'load' }).catch(e => out.push('offline goto error: ' + e.message.slice(0, 80)));
await p.waitForTimeout(2500);
const t = (await p.textContent('body')).replace(/\s+/g, ' ');
out.push('offline opens app: ' + (t.includes('LINE') || t.includes('อีเมล') || t.includes('ยังไม่ได้เชื่อมต่อ')) + ' · ' + t.slice(0, 80));
await ctx.setOffline(false);
out.push('errors: ' + JSON.stringify(errs.slice(0, 4)));
console.log(out.join('\n'));
await b.close();
