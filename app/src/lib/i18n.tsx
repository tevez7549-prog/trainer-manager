import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getJSON, setJSON } from './store';
import { EN } from './en';

/**
 * Two languages, Thai first. The app is written in Thai; in English mode every piece of text that reaches
 * the shared UI components (Txt, H, Btn, Field…) is looked up in EN. Sentences with values in them
 * ("{0} moves") are matched as templates, so screens don't need to change.
 */
export type Lang = 'th' | 'en';
const KEY = 'tm-lang';

function initial(): Lang {
  if (Platform.OS !== 'web') return 'th';
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') === 'en' ? 'en' : 'th'; } catch { return 'th'; }
}
let lang: Lang = initial();
export const getLang = () => lang;

/** Text starting with this (a zero-width space) is shown as written in every language */
export const KEEP = '\u200B';
const THAI = /[ก-ฺเ-๛]/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Tpl = { re: RegExp; order: number[]; en: string };
let tpls: Tpl[] | null = null;
function templates(): Tpl[] {
  if (tpls) return tpls;
  tpls = Object.keys(EN).filter(k => /\{\d\}/.test(k))
    // most specific (most fixed text) first
    .filter(k => k.replace(/\{\d\}/g, '').trim().length > 0)
    .sort((a, b) => b.replace(/\{\d\}/g, '').length - a.replace(/\{\d\}/g, '').length)
    .map(k => ({
      re: new RegExp('^' + k.split(/\{\d\}/).map(esc).join('([\\s\\S]+?)') + '$'),
      order: (k.match(/\{(\d)\}/g) ?? []).map(x => Number(x[1])),
      en: EN[k],
    }));
  return tpls;
}

const cache = new Map<string, string | null>();
const thaiCount = (s: string) => (s.match(/[\u0E01-\u0E3A\u0E40-\u0E5B]/g) ?? []).length;
/** Exact or template match; null when the text isn't known. When several templates fit, the one that leaves the least Thai wins. */
function lookup(s: string): string | null {
  if (cache.has(s)) return cache.get(s)!;
  cache.set(s, null);   // guards against loops while this one is worked out
  let r: string | null = EN[s] ?? null;
  if (r == null) {
    const cands: string[] = [];
    for (const t of templates()) {
      const m = s.match(t.re);
      if (!m) continue;
      const vals: string[] = [];
      t.order.forEach((n, i) => { vals[n] = tr(m[i + 1]); });
      cands.push(t.en.replace(/\{(\d)\}/g, (_, n) => vals[Number(n)] ?? ''));
      if (cands.length >= 6) break;
    }
    // "a · b · c": try every place to cut, so a known sentence can keep its own " · " (e.g. "3 sets × 10 reps · rest 75s" + " · Chest")
    const parts = s.split(' · ');
    for (let k = 1; k < parts.length; k++) cands.push(tr(parts.slice(0, k).join(' · ')) + ' · ' + tr(parts.slice(k).join(' · ')));
    let best = Infinity;
    for (const c of cands) { const n = thaiCount(c); if (n < best) { best = n; r = c; } }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(s, r);
  return r;
}

/** Thai text -> the current language. Unknown text (names, food, notes people typed) is left as it is. */
export function tr(s: string): string;
export function tr(s: string | null | undefined): string | null | undefined;
export function tr(s: string | null | undefined) {
  if (lang === 'th' || !s || s[0] === KEEP || !THAI.test(s)) return s;
  const [, lead, body, tail] = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  const hit = lookup(body);
  if (hit != null && !THAI.test(hit)) return lead + hit + tail;
  // pieces joined in code ("ลบ " + name + " แล้ว"): translate each Thai run that is known on its own
  const runs = s.replace(/[\u0E01-\u0E5B](?:[\u0E01-\u0E5B .()/,-]*[\u0E01-\u0E5B.)])?/g, run => lookup(run) ?? run);
  if (hit != null && thaiCount(hit) <= thaiCount(runs)) return lead + hit + tail;
  return runs;
}

/** For JSX children: "{n} ท่า" arrives as [5, ' ท่า'], so try the whole line first, then each piece */
export function trNode(c: React.ReactNode): React.ReactNode {
  if (lang === 'th' || c == null) return c;
  if (typeof c === 'string') return tr(c);
  if (Array.isArray(c)) {
    if (c.every(x => x == null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
      const whole = c.filter(x => x != null && typeof x !== 'boolean').join('');
      if (!THAI.test(whole)) return c;
      return tr(whole);
    }
    return c.map(x => (typeof x === 'string' ? tr(x) : x));
  }
  return c;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang, setLang: () => {} });

export function LangProvider({ children }: { children: (lang: Lang) => React.ReactNode }) {
  const [cur, setCur] = useState<Lang>(lang);
  useEffect(() => {
    getJSON<Lang>(KEY).then(l => { if ((l === 'en' || l === 'th') && l !== lang) { lang = l; cache.clear(); setCur(l); } });
  }, []);
  const setLang = (l: Lang) => { lang = l; cache.clear(); setCur(l); setJSON(KEY, l); };
  return <Ctx.Provider value={{ lang: cur, setLang }}>{children(cur)}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
