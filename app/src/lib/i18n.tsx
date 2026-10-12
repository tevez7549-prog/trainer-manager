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
    .sort((a, b) => b.replace(/\{\d\}/g, '').length - a.replace(/\{\d\}/g, '').length)
    .map(k => ({
      re: new RegExp('^' + k.split(/\{\d\}/).map(esc).join('([\\s\\S]+?)') + '$'),
      order: (k.match(/\{(\d)\}/g) ?? []).map(x => Number(x[1])),
      en: EN[k],
    }));
  return tpls;
}

const cache = new Map<string, string | null>();
/** Exact or template match; null when the text isn't known */
function lookup(s: string): string | null {
  if (cache.has(s)) return cache.get(s)!;
  let r: string | null = EN[s] ?? null;
  if (r == null) {
    for (const t of templates()) {
      const m = s.match(t.re);
      if (!m) continue;
      const vals: string[] = [];
      t.order.forEach((n, i) => { vals[n] = tr(m[i + 1]); });
      r = t.en.replace(/\{(\d)\}/g, (_, n) => vals[Number(n)] ?? '');
      break;
    }
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
  if (hit != null) return lead + hit + tail;
  // pieces joined in code ("ลบ " + name + " แล้ว"): translate each Thai run that is known on its own
  return s.replace(/[ก-๛](?:[ก-๛ .()/,-]*[ก-๛.)])?/g, run => lookup(run) ?? run);
}

/** For JSX children: "{n} ท่า" arrives as [5, ' ท่า'], so try the whole line first, then each piece */
export function trNode(c: React.ReactNode): React.ReactNode {
  if (lang === 'th' || c == null) return c;
  if (typeof c === 'string') return tr(c);
  if (Array.isArray(c)) {
    if (c.every(x => x == null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
      const whole = c.filter(x => x != null && typeof x !== 'boolean').join('');
      if (!THAI.test(whole)) return c;
      const [, lead, body, tail] = whole.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      const hit = lookup(body);
      if (hit != null) return lead + hit + tail;
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
