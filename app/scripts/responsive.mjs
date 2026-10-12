// Opens every main screen at common phone widths and reports anything wider than the screen.
// The backend is faked in the browser (a made-up signed-in user, empty data), so no real account is used.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:4000';
const REF = 'tfuafjdhxzlagclbnmws';
const UID = '00000000-0000-4000-8000-000000000001';
const WIDTHS = [320, 360, 375, 390, 414, 430];
const SHOT_WIDTHS = [320, 390];
const OUT = process.argv[2] || 'screens';
fs.mkdirSync(OUT, { recursive: true });

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', email: user.email, aud: 'authenticated' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
const profile = { id: UID, uid: '100001', display_name: 'สมชายใจดีมากเป็นพิเศษ', phone: '+66812345678', email: user.email, status: 'active', is_super_admin: false };

const MUSCLES = ['chest', 'lats', 'middle back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'abdominals', 'calves'];
const exercises = [];
MUSCLES.forEach((m, i) => { for (let k = 0; k < 6; k++) exercises.push({ id: `e${i}-${k}`, name_th: `ท่า ${m} ${k}`, name_en: `Very Long Exercise Name For ${m} Variation ${k}`, body_part: m, kind: 'strength', muscle: m, equipment: ['body only', 'dumbbell', 'barbell', 'machine', 'cable', 'bands'][k], level: 'beginner', media_url: '/ex/none.webp', created_by: null, mechanic: k % 2 ? 'isolation' : 'compound', category: 'strength' }); });
for (let k = 0; k < 4; k++) exercises.push({ id: `c${k}`, name_th: `คาร์ดิโอ ${k}`, name_en: `Jumping Jacks ${k}`, body_part: 'cardio', kind: 'cardio', muscle: 'quadriceps', equipment: 'body only', level: 'beginner', media_url: '/ex/none.webp', created_by: null, mechanic: null, category: 'cardio' });
for (let k = 0; k < 6; k++) exercises.push({ id: `s${k}`, name_th: `ยืด ${k}`, name_en: `Stretch ${k}`, body_part: 'stretch', kind: 'strength', muscle: MUSCLES[k], equipment: 'body only', level: 'beginner', media_url: '/ex/none.webp', created_by: null, mechanic: null, category: 'stretching' });

async function mock(page) {
  await page.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': '*/0', ...headers }, body: JSON.stringify(body) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p.startsWith('/auth/v1/token')) return json(session);
    if (p.startsWith('/auth/v1')) return json({});
    if (p === '/rest/v1/profiles') return json(one ? profile : [profile]);
    if (p === '/rest/v1/consents') return json(one ? { id: 'c1' } : [{ id: 'c1' }]);
    if (p === '/rest/v1/exercises') return json(one ? exercises[0] : exercises);
    if (p.startsWith('/rest/v1')) return json(one ? null : []);
    return json({});
  });
}

const ROUTES = [
  ['login', '/login', false], ['signup', '/signup', false],
  ['home', '/?me=1', true], ['train', '/my/train', true], ['random', '/my/train#random', true], ['food', '/my/food', true], ['body', '/my/body', true],
  ['groups', '/groups', true], ['group-new', '/groups/new', true], ['me', '/me', true], ['care-add', '/trainer/add', true],
];

const report = [];
const errs = new Set();
const br = await chromium.launch();
for (const lang of ['th', 'en']) {
  for (const w of WIDTHS) {
    const ctx = await br.newContext({ viewport: { width: w, height: 1400 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    for (const [name, path, auth] of ROUTES) {
      const page = await ctx.newPage();
      page.on('pageerror', e => errs.add(`${name}: ${e.message}`.slice(0, 200)));
      await mock(page);
      await page.addInitScript(([s, k, a, l]) => {
        localStorage.clear();
        localStorage.setItem('tm-lang', JSON.stringify(l));
        if (a) localStorage.setItem(k, JSON.stringify(s));
      }, [session, `sb-${REF}-auth-token`, auth, lang]);
      await page.goto(BASE + path.replace('#random', ''), { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1200);
      if (path.endsWith('#random')) {
        const btn = page.getByText(lang === 'th' ? 'สุ่มโปรแกรมวันนี้' : /random/i).first();
        if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); }
        const go = page.getByText(lang === 'th' ? 'สุ่มเลย' : /^(Randomize|Shuffle|Generate|Roll)/i).first();
        if (await go.count()) { await go.click(); await page.waitForTimeout(600); }
      }
      const r = await page.evaluate(() => {
        const W = window.innerWidth;
        const scrollW = document.documentElement.scrollWidth;
        const bad = [];
        const inHScroll = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if ((s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
        for (const el of document.querySelectorAll('body *')) {
          const rc = el.getBoundingClientRect();
          if (!rc.width || !rc.height) continue;
          if (rc.right > W + 1 || rc.left < -1) {
            if (inHScroll(el)) continue;
            const t = (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
            bad.push(`${Math.round(rc.left)}..${Math.round(rc.right)} "${t}"`);
          }
        }
        // text cut off inside its box (single-line text that doesn't fit)
        const clipped = [];
        for (const el of document.querySelectorAll('div[dir="auto"]')) {
          if (el.children.length) continue;
          if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') clipped.push(el.innerText.trim().slice(0, 40));
        }
        return { url: location.pathname, scrollW, W, bad: [...new Set(bad)].slice(0, 6), clipped: clipped.slice(0, 6) };
      });
      const flag = r.scrollW > r.W + 1 || r.bad.length;
      report.push(`${flag ? 'WIDE' : 'ok  '} ${lang} ${w} ${name} (${r.url}) scrollW=${r.scrollW}${r.bad.length ? ' · ' + r.bad.join(' | ') : ''}${r.clipped.length ? ' · cut: ' + r.clipped.join(' | ') : ''}`);
      if (SHOT_WIDTHS.includes(w)) await page.screenshot({ path: `${OUT}/${lang}-${w}-${name}.png`, fullPage: true });
      await page.close();
    }
    await ctx.close();
  }
}
await br.close();
const text = report.join('\n') + '\n\nerrors:\n' + [...errs].join('\n');
fs.writeFileSync(`${OUT}/report.txt`, text);
console.log(text);
