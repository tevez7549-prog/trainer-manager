import { supabase } from './supabase';

/** A gym's trainer, with or without the app (profile_id set = has the app and sees their own schedule) */
export type Coach = { id: string; gym_id: string; name: string; phone: string | null; profile_id: string | null; active: boolean; created_at: string };

export async function loadCoaches(gymId: string, all = false): Promise<Coach[]> {
  let q = supabase.from('gym_coaches').select('id,gym_id,name,phone,profile_id,active,created_at').eq('gym_id', gymId).order('created_at');
  if (!all) q = q.eq('active', true);
  const { data } = await q;
  return (data as Coach[]) ?? [];
}
