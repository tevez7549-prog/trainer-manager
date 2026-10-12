// "ค้นหาด้วย AI": turns what someone typed ("ข้าวสวย 100 กรัม", "ผัดกะเพราหมูสับหนึ่งจาน") into food items
// (or a photo of the plate) with estimated calories and macros. Uses the cheapest Claude model; the API key stays on the server.
// Signed-in users only, 30 lookups per person per day.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODEL = "claude-haiku-5-5";
const DAILY_LIMIT = 30;

const SYSTEM = `You estimate nutrition for food a Thai user typed or photographed. Reply with JSON only, no prose, in this shape:
{"items":[{"name":"ชื่ออาหารภาษาไทย","amount":1,"unit":"จาน","grams":350,"kcal":630,"protein_g":30,"carb_g":70,"fat_g":25}],"note":"สั้น ๆ ภาษาไทย ถ้าต้องเดา"}
Rules:
- One item per distinct food or drink in the text. Use the amount and unit the user gave; if none, assume one usual Thai serving.
- grams = estimated weight of that amount (null for drinks measured in ml is fine; then use ml as grams).
- Values are for the whole amount eaten, not per 100 g. Use typical Thai street-food / home-cooking values.
- Round kcal to whole numbers and macros to one decimal.
- If the text is not food, return {"items":[],"note":"ไม่ใช่อาหาร"}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "not signed in" }, 401);

  let body: { q?: string; image?: string; media_type?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const q = String(body.q || "").trim().slice(0, 200);
  const image = typeof body.image === "string" && body.image.length < 6_000_000 ? body.image : null;
  const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(String(body.media_type)) ? String(body.media_type) : "image/jpeg";
  if (!q && !image) return json({ error: "empty" }, 400);

  // per-person daily limit, counted in the audit log
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true })
    .eq("actor_id", who.user.id).eq("action", "food_ai").gte("at", since.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: "daily_limit" }, 429);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0, system: SYSTEM, messages: [{ role: "user", content: image
      ? [{ type: "image", source: { type: "base64", media_type: mediaType, data: image } },
         { type: "text", text: q || "อาหารในรูปนี้คืออะไร ประมาณปริมาณจากรูป" }]
      : q }] }),
  });
  if (!r.ok) return json({ error: "ai_failed", status: r.status }, 502);
  const out = await r.json();
  const text: string = (out.content ?? []).map((c: any) => c.text ?? "").join("");
  let parsed: { items?: any[]; note?: string } = {};
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return json({ error: "ai_bad_output" }, 502); }

  const num = (v: unknown, d = 1) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** d) / 10 ** d : 0; };
  const items = (parsed.items ?? []).slice(0, 8).map((i) => ({
    name: String(i.name ?? "").slice(0, 80), amount: num(i.amount), unit: String(i.unit ?? "").slice(0, 20),
    grams: i.grams == null ? null : num(i.grams, 0), kcal: num(i.kcal, 0),
    protein_g: num(i.protein_g), carb_g: num(i.carb_g), fat_g: num(i.fat_g),
  })).filter((i) => i.name);

  await admin.from("audit_log").insert({ actor_id: who.user.id, action: "food_ai", target: "meal_items", detail: { q, photo: !!image, n: items.length,
    in: out.usage?.input_tokens, out: out.usage?.output_tokens } });
  return json({ items, note: parsed.note ?? null, left: DAILY_LIMIT - (count ?? 0) - 1 });
});
