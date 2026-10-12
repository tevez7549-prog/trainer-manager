// "What should I train today?" for people without a trainer's plan.
// A simple 3-way split (push / pull / legs) rotated by what was trained least recently,
// full body for beginners, and an easy day after training hard several days in a row.

export type SplitKey = 'push' | 'pull' | 'legs' | 'full' | 'easy';
export const SPLITS: Record<SplitKey, { name: string; why: string; parts: string[]; moves: string[] }> = {
  push: { name: 'ส่วนบน ดัน (อก ไหล่ แขนหลัง)', why: 'อก ไหล่ ไทรเซป', parts: ['chest', 'shoulders'], moves: ['Barbell Bench Press - Medium Grip', 'Dumbbell Shoulder Press', 'Side Lateral Raise', 'Triceps Pushdown'] },
  pull: { name: 'ส่วนบน ดึง (หลัง แขนหน้า)', why: 'หลัง ไบเซป', parts: ['back'], moves: ['Wide-Grip Lat Pulldown', 'Seated Cable Rows', 'Face Pull', 'Dumbbell Bicep Curl'] },
  legs: { name: 'ขา + แกนกลาง', why: 'ขา ก้น หน้าท้อง', parts: ['legs', 'core'], moves: ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Plank'] },
  full: { name: 'ทั้งตัว (เริ่มต้น)', why: 'ทุกส่วนเบา ๆ เหมาะกับช่วงเริ่ม', parts: [], moves: ['Goblet Squat', 'Dumbbell Bench Press', 'Wide-Grip Lat Pulldown', 'Plank'] },
  easy: { name: 'คาร์ดิโอเบา ๆ + ยืดเหยียด', why: 'ให้กล้ามเนื้อได้พัก', parts: ['cardio', 'stretch'], moves: ['Walking, Treadmill', "World's Greatest Stretch"] },
};

export type RecentWorkout = { started_at: string; title: string | null; parts: string[] };

const dayDiff = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/** Pick today's suggestion from the last two weeks of workouts */
export function suggest(recent: RecentWorkout[]): { key: SplitKey; reason: string } {
  if (!recent.length) return { key: 'full', reason: 'ยังไม่มีประวัติ เริ่มจากทั้งตัวก่อน 2–3 ครั้งต่อสัปดาห์' };
  const last3 = recent.filter(w => dayDiff(w.started_at) < 3);
  if (last3.length >= 3) return { key: 'easy', reason: 'เล่นติดกัน 3 วันแล้ว วันนี้เบา ๆ ให้ร่างกายฟื้น' };
  if (recent.length < 4) {
    // still a beginner: full body, but not two days in a row
    if (dayDiff(recent[0].started_at) < 1) return { key: 'easy', reason: 'เมื่อวานเพิ่งเล่นทั้งตัว วันนี้เบา ๆ ก่อน' };
    return { key: 'full', reason: `เล่นไปแล้ว ${recent.length} ครั้ง ทั้งตัวอีกสักพักแล้วค่อยแยกส่วน` };
  }
  // the split whose muscles were trained longest ago
  const order: SplitKey[] = ['push', 'pull', 'legs'];
  const lastFor = (k: SplitKey) => recent.find(w => w.parts.some(p => SPLITS[k].parts.includes(p)))?.started_at ?? null;
  const pick = order.map(k => ({ k, at: lastFor(k) })).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))[0];
  return { key: pick.k, reason: pick.at ? `เล่นส่วนนี้ล่าสุด ${dayDiff(pick.at) === 0 ? 'วันนี้' : `${dayDiff(pick.at)} วันก่อน`}` : 'ยังไม่ได้เล่นส่วนนี้ใน 2 สัปดาห์' };
}

/** Own programs in rotation: the one after the last one done */
export function nextInRotation<T extends { id: string; name: string }>(programs: T[], recent: RecentWorkout[]): { p: T; lastDone: string | null } | null {
  if (!programs.length) return null;
  const ordered = [...programs].reverse();   // oldest first = the order they were planned
  const lastIdx = recent.map(w => ordered.findIndex(p => p.name === w.title)).find(i => i >= 0);
  const p = lastIdx === undefined ? ordered[0] : ordered[(lastIdx + 1) % ordered.length];
  const lastDone = recent.find(w => w.title === p.name)?.started_at ?? null;
  return { p, lastDone };
}

export const agoText = (iso: string | null) => {
  if (!iso) return 'ยังไม่เคยเล่น';
  const d = dayDiff(iso);
  return d === 0 ? 'เล่นล่าสุดวันนี้' : `เล่นล่าสุด ${d} วันก่อน`;
};
