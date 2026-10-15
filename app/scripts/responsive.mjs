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

// two weeks of meals (some days skipped, some over the goal) so the food history has something to draw
const target = { id: 't1', kcal: 2000, protein_g: 120, carb_g: 220, fat_g: 65, goal: 'maintain', style: 'balanced', target_weight: null, set_by: UID, created_at: '2026-01-01T00:00:00Z' };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const meals = [];
[1800, 2100, 0, 2600, 1950, 2300, 1700, 2000, 0, 2450, 1900, 2050, 1600, 2200].forEach((k, i) => {
  if (!k) return;
  const d = new Date(); d.setDate(d.getDate() - i);
  ['มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น'].forEach((name, j) => meals.push({ id: `m${i}-${j}`, user_id: UID, eaten_on: iso(d), name, position: j,
    items: [{ id: `i${i}-${j}`, meal_id: `m${i}-${j}`, name: 'ข้าวกะเพราไก่ไข่ดาวพิเศษเผ็ดน้อย', grams: 350, kcal: k / 3, protein_g: 35, carb_g: 70, fat_g: 20, from_ai: false, food_id: null }] }));
});

const seg = (a, t, l) => ({ ra: [a, 104], la: [a - 0.05, 103], tr: [t, 102], rl: [l, 107], ll: [l + 0.02, 107.3] });
const scans = [[93.4, 42.9, 19.5, 20.9, 79, '2026-10-14'], [94.9, 43.8, 19.4, 20.4, 80, '2026-09-30'], [93.2, 44.0, 17.5, 18.8, 81, '2026-09-14'],
  [94.1, 43.0, 20.1, 21.4, 79, '2026-09-03'], [95.4, 44.0, 19.5, 20.4, 80, '2026-08-21'], [94.9, 44.2, 18.7, 19.7, 80, '2026-08-17'],
  [93.4, 43.1, 19.1, 20.5, 79, '2026-08-04'], [94.9, 44.8, 17.8, 18.8, 81, '2026-07-20'], [96.0, 44.1, 20.2, 21.0, 79, '2026-07-01']]
  .map(([w, m, f, p, sc, d], i) => ({ id: `s${i}`, measured_at: `${d}T15:08:00+07:00`, model: '270', height_cm: 183, weight_kg: w, smm_kg: m, fat_kg: f, pbf: p, bmi: 24.3, score: sc,
    tbw_l: 48.2, protein_kg: 13.1, mineral_kg: 4.49, ffm_kg: 65.8, bmr: 1790, whr: 0.9, visceral: 6, target_weight: 77.4, weight_ctrl: -4, fat_ctrl: -4, muscle_ctrl: 0,
    seg_lean: seg(3.8, 29.3, 10.73), seg_fat: seg(0.8, 8.3, 2.3), created_by: UID }));

const groupMock = { id: 'gr1', name: 'แก๊งยิมเย็นวันพฤหัส', kind: 'friends', code: 'ABC123', owner_id: UID, created_at: '2026-01-01T00:00:00Z' };
const peopleMock = [[UID, 'สมชายใจดีมากเป็นพิเศษ'], ['u2', 'มิ้นท์'], ['u3', 'บอส']].map(([user_id, display_name], i) => ({ user_id, uid: 100001 + i, display_name, is_owner: i === 0, joined_at: '2026-01-01T00:00:00Z', last_workout: null, i_care: false }));
const isoAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const foodMock = [];
peopleMock.forEach((p, k) => { for (let i = 0; i < 6; i++) foodMock.push({ user_id: p.user_id, display_name: p.display_name, day: isoAgo(i), kcal: [1980, 1450, 2620][k] - i * 30, protein_g: 110, carb_g: 210, fat_g: 60, items: 7, t_kcal: 2000, t_protein: 120, t_carb: 220, t_fat: 65 }); });

const gym = { id: 'g1', name: 'Build Up Gym พัทยากลาง', branch: 'พัทยา', phone: null, walkin_price: 100, closed_weekdays: [], country_code: '66', address: null, open_hours: { open: '06:00', close: '22:00' } };
const coachesMock = [['c1', 'โค้ชต้อม'], ['c2', 'โค้ชแนนซี่ ใจดีมาก']].map(([id, name]) => ({ id, gym_id: 'g1', name, phone: null, profile_id: null, active: true, created_at: '2026-01-01T00:00:00Z' }));
const at = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const classesMock = [['k1', 'บอดี้คอมแบท ระดับเริ่มต้น', 18, 20], ['k2', 'โยคะเช้า', 7, null]].map(([id, name, h, cap]) => ({ id, gym_id: 'g1', name, coach_id: 'c1', starts_at: at(h), duration_min: 60,
  capacity: cap, note: null, status: 'scheduled', series_id: null, coach: { name: 'โค้ชต้อม' },
  bookings: [{ id: 'b1', member_id: 'm1', guest_name: null, status: 'attended', member: { name: 'สมชาย ใจดี', code: 'M-0001' } }, { id: 'b2', member_id: null, guest_name: 'คนนอก ทดลองเล่น', status: 'booked', member: null }] }));
const membersMock = [['m1', 'สมชาย ใจดีมากเป็นพิเศษ', 3], ['m2', 'มานี มีนา', -5]].map(([id, name, d]) => ({ id, name, plan_name: 'รายเดือน', days_left: d, code: 'M-0001', status: d < 0 ? 'expired' : 'expiring' }));

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
    if (p === '/rest/v1/nutrition_targets') return json(one ? target : [target]);
    if (p === '/rest/v1/gyms') return json(one ? gym : [gym]);
    if (p === '/rest/v1/gym_staff') return json(one ? { role: 'owner' } : [{ role: 'owner', gym_id: gym.id, gym }]);
    if (p === '/rest/v1/gym_coaches') return json(one ? coachesMock[0] : coachesMock);
    if (p === '/rest/v1/class_sessions') return json(one ? classesMock[0] : classesMock);
    if (p === '/rest/v1/member_status') return json(one ? membersMock[0] : membersMock, 200, { 'content-range': `0-${membersMock.length - 1}/${membersMock.length}` });
    if (p === '/rest/v1/body_scans') return json(one ? scans[0] : scans);
    if (p === '/rest/v1/groups') return json(one ? groupMock : [groupMock]);
    if (p === '/rest/v1/rpc/group_people') return json(peopleMock);
    if (p === '/rest/v1/rpc/group_food') return json(foodMock);
    if (p === '/rest/v1/rpc/group_food_items') return json([{ meal: 'มื้อเช้า', name: 'ไก่ต้มติดหนัง 150 กรัม', grams: 150, kcal: 210, protein_g: 30, carb_g: 0, fat_g: 10 }, { meal: 'มื้อกลางวัน', name: 'ข้าวสวย', grams: 165, kcal: 215, protein_g: 5, carb_g: 47, fat_g: 1 }]);
    if (p === '/rest/v1/group_members') return json(peopleMock.map(x => ({ user_id: x.user_id })));
    if (p === '/rest/v1/meals') {
      const eq = url.searchParams.get('eaten_on');
      const rows = eq && eq.startsWith('eq.') ? meals.filter(m => m.eaten_on === eq.slice(3)) : meals;
      return json(one ? rows[0] ?? null : rows);
    }
    if (p.startsWith('/rest/v1')) return json(one ? null : []);
    return json({});
  });
}

const ROUTES = [
  ['login', '/login', false], ['signup', '/signup', false],
  ['home', '/?me=1', true], ['train', '/my/train', true], ['train-log', '/my/train#log', true], ['random', '/my/train#random', true], ['food', '/my/food', true], ['food-history', '/my/food#history', true], ['body', '/my/body', true], ['gym-overview', '/gym/g1', true], ['gym-classes', '/gym/g1/classes', true], ['gym-new', '/gym/new', true],
  ['groups', '/groups', true], ['group-new', '/groups/new', true], ['group-food', '/groups/gr1#food', true], ['me', '/me', true], ['care-add', '/trainer/add', true],
];

const report = [];
const errs = new Set();
const br = await chromium.launch();
for (const lang of ['th', 'en']) {
  for (const w of WIDTHS) {
    const ctx = await br.newContext({ viewport: { width: w, height: 1400 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1' });
    for (const [name, path, auth] of ROUTES) {
      const page = await ctx.newPage();
      page.on('pageerror', e => errs.add(`${name}: ${e.message}`.slice(0, 200)));
      await mock(page);
      await page.addInitScript(([s, k, a, l]) => {
        localStorage.clear();
        localStorage.setItem('tm-lang', JSON.stringify(l));
        if (a) localStorage.setItem(k, JSON.stringify(s));
      }, [session, `sb-${REF}-auth-token`, auth, lang]);
      await page.goto(BASE + path.replace(/#.*$/, ''), { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1200);
      if (path.endsWith('#history')) {
        const h = page.getByText(lang === 'th' ? 'ดูย้อนหลัง' : 'History', { exact: true }).first();
        if (await h.count()) { await h.click(); await page.waitForTimeout(800); }
        await page.evaluate(() => { const els = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).overflowY === 'auto' || getComputedStyle(d).overflowY === 'scroll'); els.forEach(d => { d.scrollTop = d.scrollHeight; }); });
        await page.waitForTimeout(300);
      }
      if (path.endsWith('#log')) {
        const b = page.getByText(lang === 'th' ? 'เริ่มบันทึกการเล่นเอง' : /log a workout|start logging/i).first();
        if (await b.count()) { await b.click(); await page.waitForTimeout(800); }
        const box = page.getByText(lang === 'th' ? 'ค้นหาท่า' : 'Find a move', { exact: true }).first();
        if (await box.count()) { await box.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -80)); await page.waitForTimeout(300); }
      }
      if (path.endsWith('#food')) {
        const t = page.getByRole('tab', { name: lang === 'th' ? 'อาหาร' : 'Food' }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(800); }
        const row = page.getByText('มิ้นท์').first();
        if (await row.count()) { await row.click(); await page.waitForTimeout(600); }
      }
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
