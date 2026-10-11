import { supabase } from './supabase';

// ---------- food ----------
export type Food = { id: string; name_th: string; serving_g: number; kcal: number; protein_g: number; carb_g: number; fat_g: number; created_by: string | null };
export type MealItem = { id: string; meal_id: string; name: string; grams: number | null; kcal: number; protein_g: number; carb_g: number; fat_g: number; from_ai: boolean; food_id: string | null };
export type Meal = { id: string; user_id: string; eaten_on: string; name: string; position: number; items: MealItem[] };
export type Target = { id: string; kcal: number; protein_g: number | null; carb_g: number | null; fat_g: number | null; goal: string | null; style: string | null;
  target_weight: number | null; set_by: string | null; created_at: string };
export type Totals = { kcal: number; p: number; c: number; f: number };

export const MEAL_NAMES = ['มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น', 'ของว่าง'];

export const totals = (items: Pick<MealItem, 'kcal' | 'protein_g' | 'carb_g' | 'fat_g'>[]): Totals =>
  items.reduce((t, i) => ({ kcal: t.kcal + Number(i.kcal), p: t.p + Number(i.protein_g), c: t.c + Number(i.carb_g), f: t.f + Number(i.fat_g) }), { kcal: 0, p: 0, c: 0, f: 0 });

export async function loadDay(userId: string, day: string): Promise<Meal[]> {
  const { data } = await supabase.from('meals').select('id,user_id,eaten_on,name,position,items:meal_items(id,meal_id,name,grams,kcal,protein_g,carb_g,fat_g,from_ai,food_id)')
    .eq('user_id', userId).eq('eaten_on', day).order('position');
  return ((data as any) ?? []) as Meal[];
}

export async function latestTarget(userId: string): Promise<Target | null> {
  const { data } = await supabase.from('nutrition_targets').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
  return ((data as Target[]) ?? [])[0] ?? null;
}

/** Find or create the meal row for that day and name, then add an item to it */
export async function addItem(userId: string, day: string, mealName: string, item: Omit<MealItem, 'id' | 'meal_id'>) {
  let { data: m } = await supabase.from('meals').select('id').eq('user_id', userId).eq('eaten_on', day).eq('name', mealName).maybeSingle();
  if (!m) {
    const r = await supabase.from('meals').insert({ user_id: userId, eaten_on: day, name: mealName, position: Math.max(0, MEAL_NAMES.indexOf(mealName)) }).select('id').single();
    if (r.error) return { error: r.error };
    m = r.data;
  }
  return supabase.from('meal_items').insert({ ...item, meal_id: m!.id, user_id: userId });
}

/** Mifflin–St Jeor BMR × activity, then the goal adjustment. Returns kcal and grams per macro. */
export function calcTarget(o: { sex: 'm' | 'f'; age: number; height: number; weight: number; activity: number; goal: 'lose' | 'maintain' | 'gain'; style: 'balanced' | 'high_carb' | 'low_carb' }) {
  const bmr = 10 * o.weight + 6.25 * o.height - 5 * o.age + (o.sex === 'm' ? 5 : -161);
  const tdee = bmr * o.activity;
  const kcal = Math.round((o.goal === 'lose' ? tdee - 500 : o.goal === 'gain' ? tdee + 300 : tdee) / 10) * 10;
  const split = o.style === 'high_carb' ? [0.25, 0.55, 0.20] : o.style === 'low_carb' ? [0.35, 0.25, 0.40] : [0.30, 0.40, 0.30];
  return { tdee: Math.round(tdee), kcal, protein_g: Math.round(kcal * split[0] / 4), carb_g: Math.round(kcal * split[1] / 4), fat_g: Math.round(kcal * split[2] / 9) };
}
export const ACTIVITY = [
  { v: 1.2, t: 'แทบไม่ขยับ' }, { v: 1.375, t: 'ออกกำลัง 1–3 วัน' }, { v: 1.55, t: '3–5 วัน' }, { v: 1.725, t: '6–7 วัน' },
];

// ---------- body ----------
export type Body = { id: string; measured_on: string; weight_kg: number | null; waist_cm: number | null; hip_cm: number | null; arm_cm: number | null; thigh_cm: number | null; created_by: string | null };
export type Photo = { id: string; taken_on: string; angle: 'front' | 'side' | 'back'; storage_path: string; url?: string };
export const ANGLE_TH = { front: 'ด้านหน้า', side: 'ด้านข้าง', back: 'ด้านหลัง' } as const;

// ---------- training ----------
export type Exercise = { id: string; name_th: string; name_en: string | null; body_part: string; kind: string };
export const PART_TH: Record<string, string> = { chest: 'อก', back: 'หลัง', legs: 'ขา', shoulders: 'ไหล่', arms: 'แขน', core: 'แกนกลาง', cardio: 'คาร์ดิโอ', stretch: 'ยืดเหยียด' };
export type WSet = { id?: string; exercise_id: string | null; exercise_name: string; set_no: number; reps: number | null; weight_kg: number | null; duration_sec: number | null };
export type Workout = { id: string; title: string | null; started_at: string; ended_at: string | null; note: string | null; trainer_id: string | null; sets: WSet[] };

export const fmt1 = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }));
