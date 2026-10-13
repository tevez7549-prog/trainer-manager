import { supabase } from './supabase';
import { uuid } from './store';

/** A class at one date and time, with who is in it */
export type ClassBooking = { id: string; member_id: string | null; guest_name: string | null; status: 'booked' | 'attended' | 'noshow'; member: { name: string; code: string | null } | null };
export type ClassSession = {
  id: string; gym_id: string; name: string; coach_id: string | null; starts_at: string; duration_min: number; capacity: number | null;
  note: string | null; status: 'scheduled' | 'cancelled'; series_id: string | null;
  coach: { name: string } | null; bookings: ClassBooking[];
};
const COLS = 'id,gym_id,name,coach_id,starts_at,duration_min,capacity,note,status,series_id,coach:gym_coaches(name),'
  + 'bookings:class_bookings(id,member_id,guest_name,status,member:members(name,code))';

export async function loadClasses(gymId: string, fromIso: string, toIso: string, withCancelled = false): Promise<ClassSession[]> {
  let q = supabase.from('class_sessions').select(COLS).eq('gym_id', gymId).gte('starts_at', fromIso).lt('starts_at', toIso).order('starts_at');
  if (!withCancelled) q = q.eq('status', 'scheduled');
  const { data } = await q;
  return ((data as any) ?? []) as ClassSession[];
}

/** One class, or the same class every week for `weeks` weeks */
export async function createClass(o: { gymId: string; by: string; name: string; coachId: string | null; date: string; time: string; duration: number; capacity: number | null; note: string | null; weeks: number }) {
  const series = o.weeks > 1 ? uuid() : null;
  const rows = Array.from({ length: Math.max(1, o.weeks) }, (_, i) => {
    const d = new Date(`${o.date}T${o.time}:00`); d.setDate(d.getDate() + i * 7);
    return { gym_id: o.gymId, name: o.name, coach_id: o.coachId, starts_at: d.toISOString(), duration_min: o.duration, capacity: o.capacity, note: o.note, series_id: series, created_by: o.by };
  });
  return supabase.from('class_sessions').insert(rows);
}

export const cancelClass = (id: string) => supabase.from('class_sessions').update({ status: 'cancelled' }).eq('id', id);
/** This class and every later one in its weekly series */
export const cancelSeriesFrom = (s: ClassSession) =>
  supabase.from('class_sessions').update({ status: 'cancelled' }).eq('series_id', s.series_id!).gte('starts_at', s.starts_at);

export const addMember = (sessionId: string, memberId: string, by: string) =>
  supabase.from('class_bookings').insert({ session_id: sessionId, member_id: memberId, created_by: by });
export const addGuest = (sessionId: string, name: string, by: string) =>
  supabase.from('class_bookings').insert({ session_id: sessionId, guest_name: name.trim(), created_by: by });
export const setBooking = (id: string, status: ClassBooking['status']) => supabase.from('class_bookings').update({ status }).eq('id', id);
export const removeBooking = (id: string) => supabase.from('class_bookings').delete().eq('id', id);

export const bookingName = (b: ClassBooking) => b.member?.name ?? b.guest_name ?? '–';
export const seats = (s: ClassSession) => (s.capacity ? `${s.bookings.length}/${s.capacity} คน` : `${s.bookings.length} คน`);
export const isFull = (s: ClassSession) => !!s.capacity && s.bookings.length >= s.capacity;
