import type { LibEx } from './exercise';

/** Random workout: pick moves from the library by body part, equipment, level and goal. No AI, all on the phone. */

export type PartKey = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core' | 'full' | 'cardio';
export const PARTS: { k: PartKey; t: string; muscles: string[] }[] = [
  { k: 'full', t: 'ทั้งตัว', muscles: [] },
  { k: 'chest', t: 'อก', muscles: ['chest'] },
  { k: 'back', t: 'หลัง', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { k: 'shoulders', t: 'ไหล่', muscles: ['shoulders'] },
  { k: 'arms', t: 'แขน', muscles: ['biceps', 'triceps', 'forearms'] },
  { k: 'legs', t: 'ขา', muscles: ['quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors'] },
  { k: 'glutes', t: 'ก้น', muscles: ['glutes', 'hamstrings'] },
  { k: 'core', t: 'หน้าท้อง', muscles: ['abdominals'] },
  { k: 'cardio', t: 'คาร์ดิโอ', muscles: [] },
];
// "full body" = one slot per big area, in this order
const FULL: PartKey[] = ['legs', 'chest', 'back', 'shoulders', 'core', 'glutes', 'arms'];

export type EquipKey = 'body' | 'dumbbell' | 'barbell' | 'machine' | 'bands' | 'kettlebell' | 'other';
export const EQUIP: { k: EquipKey; t: string; list: (string | null)[] }[] = [
  { k: 'body', t: 'ตัวเปล่า', list: ['body only', null] },
  { k: 'dumbbell', t: 'ดัมเบล', list: ['dumbbell'] },
  { k: 'barbell', t: 'บาร์เบล', list: ['barbell', 'e-z curl bar'] },
  { k: 'machine', t: 'เครื่อง / เคเบิล', list: ['machine', 'cable'] },
  { k: 'bands', t: 'ยางยืด', list: ['bands'] },
  { k: 'kettlebell', t: 'เคตเทิลเบล', list: ['kettlebells'] },
  { k: 'other', t: 'บอล / อื่น ๆ', list: ['medicine ball', 'exercise ball', 'foam roll', 'other'] },
];

export type Level = 'beginner' | 'intermediate' | 'expert';
export const LEVELS: { k: Level; t: string }[] = [{ k: 'beginner', t: 'เริ่มต้น' }, { k: 'intermediate', t: 'กลาง' }, { k: 'expert', t: 'หนัก' }];

export type Goal = 'muscle' | 'strength' | 'burn' | 'health';
export const GOALS: { k: Goal; t: string; why: string; sets: number; reps: string; rest: number }[] = [
  { k: 'muscle', t: 'สร้างกล้าม', why: '3 เซต × 10 ครั้ง · พัก 75 วิ', sets: 3, reps: '10', rest: 75 },
  { k: 'strength', t: 'เพิ่มแรง', why: '4 เซต × 5 ครั้ง · พัก 2.5 นาที', sets: 4, reps: '5', rest: 150 },
  { k: 'burn', t: 'เผาผลาญ', why: '3 เซต × 15 ครั้ง · พัก 40 วิ', sets: 3, reps: '15', rest: 40 },
  { k: 'health', t: 'สุขภาพทั่วไป', why: '2 เซต × 12 ครั้ง · พัก 60 วิ', sets: 2, reps: '12', rest: 60 },
];

export type Filters = {
  parts: PartKey[]; equip: EquipKey[]; level: Level; goal: Goal;
  count: number | null;   // number of moves; null = fit the time
  minutes: number;        // time available
  warmup: boolean; stretch: boolean; fresh: boolean;
};
export const DEFAULT_FILTERS: Filters = {
  parts: ['full'], equip: ['body', 'dumbbell', 'barbell', 'machine', 'bands', 'kettlebell', 'other'], level: 'beginner', goal: 'muscle',
  count: null, minutes: 45, warmup: true, stretch: true, fresh: true,
};

export type Pick = { ex: LibEx; sets: number; reps: string; rest: number; role: 'warmup' | 'main' | 'stretch'; slot: PartKey | 'warmup' | 'stretch'; locked?: boolean };

const SET_WORK = 40;      // seconds doing one set
const SWITCH = 60;        // seconds to set up the next move
export const WARM_MIN = 5, STRETCH_MIN = 5;

/** Minutes one main move takes with this goal */
export const moveMinutes = (g: Goal) => { const x = GOALS.find(v => v.k === g)!; return (x.sets * SET_WORK + (x.sets - 1) * x.rest + SWITCH) / 60; };

/** How many main moves fit, or the chosen count */
export function moveCount(f: Filters) {
  if (f.count) return f.count;
  const free = f.minutes - (f.warmup ? WARM_MIN : 0) - (f.stretch ? STRETCH_MIN : 0);
  return Math.max(2, Math.min(10, Math.floor(free / moveMinutes(f.goal))));
}
export function totalMinutes(picks: Pick[], goal: Goal) {
  const main = picks.filter(p => p.role === 'main').length;
  return Math.round(main * moveMinutes(goal) + (picks.some(p => p.role === 'warmup') ? WARM_MIN : 0) + (picks.some(p => p.role === 'stretch') ? STRETCH_MIN : 0));
}

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const LV: Record<Level, string[]> = { beginner: ['beginner'], intermediate: ['beginner', 'intermediate'], expert: ['beginner', 'intermediate', 'expert'] };

function okBase(e: LibEx, f: Filters) {
  const eq = EQUIP.filter(x => f.equip.includes(x.k)).flatMap(x => x.list);
  return !!e.media_url && LV[f.level].includes(e.level ?? 'beginner') && eq.includes(e.equipment ?? null)
    && !(f.level !== 'expert' && ['powerlifting', 'olympic weightlifting', 'strongman'].includes(e.category ?? ''));
}
function poolFor(lib: LibEx[], slot: PartKey, f: Filters) {
  if (slot === 'cardio') return lib.filter(e => okBase(e, f) && (e.category === 'cardio' || e.category === 'plyometrics'));
  const muscles = PARTS.find(p => p.k === slot)!.muscles;
  return lib.filter(e => okBase(e, f) && e.kind === 'strength' && ['strength', 'powerlifting', 'olympic weightlifting', 'strongman'].includes(e.category ?? 'strength')
    && muscles.includes(e.muscle ?? ''));
}

/** The order of body parts for N moves: round-robin over what was chosen ("full" = big areas first) */
export function slotsFor(f: Filters, n: number): PartKey[] {
  let parts: PartKey[] = f.parts.includes('full') ? FULL : f.parts.filter(p => p !== 'full');
  if (!parts.length) parts = FULL;
  return Array.from({ length: n }, (_, i) => parts[i % parts.length]);
}

/** One move for a slot: compound moves first in a session, nothing twice, avoid what was just done */
export function pickOne(lib: LibEx[], slot: PartKey, f: Filters, taken: Set<string>, recent: Set<string>, preferCompound: boolean): LibEx | null {
  const pool = shuffle(poolFor(lib, slot, f).filter(e => !taken.has(e.id)));
  if (!pool.length) return null;
  const fresh = f.fresh ? pool.filter(e => !recent.has(e.id)) : pool;
  const base = fresh.length ? fresh : pool;
  if (preferCompound) { const c = base.find(e => e.mechanic === 'compound'); if (c) return c; }
  return base[0];
}

function pickExtra(lib: LibEx[], kind: 'warmup' | 'stretch', f: Filters, taken: Set<string>, parts: PartKey[]): LibEx | null {
  const muscles = new Set(parts.flatMap(p => PARTS.find(x => x.k === p)?.muscles ?? []));
  const pool = lib.filter(e => !!e.media_url && !taken.has(e.id) && (kind === 'warmup'
    ? e.category === 'cardio' && LV.intermediate.includes(e.level ?? 'beginner')
    : e.category === 'stretching' && (!muscles.size || muscles.has(e.muscle ?? ''))));
  return shuffle(pool)[0] ?? null;
}

/** Build the whole session. Locked picks stay where they are; everything else is drawn again. */
export function build(lib: LibEx[], f: Filters, recent: Set<string>, keep: Pick[] = []): Pick[] {
  const g = GOALS.find(x => x.k === f.goal)!;
  const taken = new Set(keep.filter(p => p.locked).map(p => p.ex.id));
  const out: Pick[] = [];
  const parts = f.parts.includes('full') || !f.parts.length ? FULL : f.parts;

  const lockedOf = (role: Pick['role']) => keep.filter(p => p.locked && p.role === role);
  if (f.warmup) {
    const k = lockedOf('warmup')[0];
    const e = k?.ex ?? pickExtra(lib, 'warmup', f, taken, parts);
    if (e) { taken.add(e.id); out.push({ ex: e, sets: 1, reps: String(WARM_MIN), rest: 0, role: 'warmup', slot: 'warmup', locked: !!k }); }
  }
  const slots = slotsFor(f, moveCount(f));
  const lockedMain = lockedOf('main');
  slots.forEach((slot, i) => {
    const k = lockedMain[i];
    if (k) { out.push(k); return; }
    const cardio = slot === 'cardio';
    const e = pickOne(lib, slot, f, taken, recent, i < Math.ceil(slots.length / 2));
    if (!e) return;
    taken.add(e.id);
    out.push(cardio ? { ex: e, sets: 1, reps: '10', rest: 60, role: 'main', slot } : { ex: e, sets: g.sets, reps: g.reps, rest: g.rest, role: 'main', slot });
  });
  if (f.stretch) {
    const ks = lockedOf('stretch');
    for (let i = 0; i < 2; i++) {
      const e = ks[i]?.ex ?? pickExtra(lib, 'stretch', f, taken, parts);
      if (e) { taken.add(e.id); out.push({ ex: e, sets: 1, reps: '1', rest: 0, role: 'stretch', slot: 'stretch', locked: !!ks[i] }); }
    }
  }
  return out;
}

/** Swap one move for another of the same kind */
export function swap(lib: LibEx[], picks: Pick[], i: number, f: Filters, recent: Set<string>): Pick[] {
  const p = picks[i];
  const taken = new Set(picks.map(x => x.ex.id));
  const parts = f.parts.includes('full') || !f.parts.length ? FULL : f.parts;
  const e = p.role === 'main' ? pickOne(lib, p.slot as PartKey, f, taken, recent, false) : pickExtra(lib, p.role, f, taken, parts);
  if (!e) return picks;
  return picks.map((x, j) => (j === i ? { ...x, ex: e, locked: false } : x));
}

/** How many moves the filters allow for each chosen part (to warn before an empty result) */
export function poolSizes(lib: LibEx[], f: Filters) {
  const parts = f.parts.includes('full') || !f.parts.length ? FULL : f.parts;
  return parts.map(p => ({ k: p, n: poolFor(lib, p, f).length }));
}
