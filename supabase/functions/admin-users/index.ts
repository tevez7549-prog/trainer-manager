// Super Admin actions that need the service role (create / delete login accounts, suspend, reset password).
// Only callable by a signed-in, active super admin. The service role key never leaves the server.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // who is calling?
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "not signed in" }, 401);
  const me = who.user;
  const { data: prof } = await admin.from("profiles").select("is_super_admin,status").eq("id", me.id).single();
  if (!prof?.is_super_admin || prof.status !== "active") return json({ error: "super admin only" }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const log = (action: string, target_id: string, detail: Record<string, unknown> = {}) =>
    admin.from("audit_log").insert({ actor_id: me.id, action, target: "profiles", target_id, detail });

  try {
    switch (body.action) {
      case "create": {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email) return json({ error: "ต้องมีอีเมล" }, 400);
        if (password.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
        // one phone = one account: say who already has it, instead of the database's bare "Database error creating new user"
        if (body.phone) {
          const { data: dup } = await admin.from("profiles").select("uid,display_name").eq("phone", String(body.phone)).maybeSingle();
          if (dup) return json({ error: `เบอร์นี้เป็นของบัญชี UID ${dup.uid} (${dup.display_name || "ไม่มีชื่อ"}) อยู่แล้ว · เปิดบัญชีนั้นแล้วตั้งอีเมลและรหัสผ่านแทนการสร้างใหม่` }, 400);
        }
        const { data: dupMail } = await admin.from("profiles").select("uid,display_name").eq("email", email).maybeSingle();
        if (dupMail) return json({ error: `อีเมลนี้เป็นของบัญชี UID ${dupMail.uid} (${dupMail.display_name || "ไม่มีชื่อ"}) อยู่แล้ว` }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { display_name: body.display_name || "", phone: body.phone || null },
        });
        if (error) return json({ error: error.message }, 400);
        await log("create_user", data.user.id, { email });
        return json({ id: data.user.id });
      }
      case "delete": {
        if (body.id === me.id) return json({ error: "ลบบัญชีตัวเองไม่ได้" }, 400);
        const { data: p } = await admin.from("profiles").select("uid,display_name,email").eq("id", body.id).single();
        const { error } = await admin.auth.admin.deleteUser(body.id);
        if (error) return json({ error: error.message }, 400);
        await log("delete_user", body.id, p || {});
        return json({ ok: true });
      }
      case "set_status": {
        if (body.id === me.id) return json({ error: "ระงับบัญชีตัวเองไม่ได้" }, 400);
        const status = body.status === "suspended" ? "suspended" : "active";
        const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: status === "suspended" ? "876000h" : "none" });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ status }).eq("id", body.id);
        await log(status === "suspended" ? "suspend_user" : "unsuspend_user", body.id);
        return json({ ok: true });
      }
      case "set_email": {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) return json({ error: "ต้องมีอีเมล" }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.id, { email, email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ email }).eq("id", body.id);
        await log("set_email", body.id, { email });
        return json({ ok: true });
      }
      case "set_password": {
        const password = String(body.password || "");
        if (password.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.id, { password });
        if (error) return json({ error: error.message }, 400);
        await log("set_password", body.id);
        return json({ ok: true });
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
