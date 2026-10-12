// One-off job: translate the exercise library's how-to into Thai (and give each move the Thai name gym-goers use).
// Called by the database (pg_cron + pg_net) with a few slugs at a time; the job token proves the caller.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const MODEL = "claude-haiku-5-5";
const SYSTEM = `You translate gym exercise instructions from English to natural, easy Thai for a Thai fitness app.
Input: JSON array of {slug, name, steps}. Output JSON only: [{"slug":"...","name_th":"...","steps_th":["...", "..."]}]
- name_th: the name Thai gym-goers actually say (usually Thai transliteration of the English, e.g. "บาร์เบลสควอท", "ดัมเบลเพรส", "แพลงก์"), short.
- steps_th: one Thai sentence per original step, same order, plain words, keep "kg", "reps" style terms in Thai (ครั้ง, เซ็ต).
- Do not add or drop steps. No prose outside the JSON.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { slugs, token } = await req.json().catch(() => ({}));
  const { data: ok } = await db.rpc("job_token_ok", { job: "ex-translate", tok: String(token ?? "") });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  if (!Array.isArray(slugs) || !slugs.length || slugs.length > 10) return json({ error: "slugs" }, 400);

  const { data: rows } = await db.from("exercises").select("slug,name_en,how_to_en").in("slug", slugs).is("how_to_th", null);
  if (!rows?.length) return json({ done: 0 });
  const input = rows.map((r) => ({ slug: r.slug, name: r.name_en, steps: String(r.how_to_en ?? "").split("\n").filter(Boolean) }));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(input) }] }),
  });
  if (!r.ok) { const t = await r.text(); console.error("anthropic", r.status, t.slice(0, 300)); return json({ error: "ai_failed", status: r.status }, 502); }
  const out = await r.json();
  const text: string = (out.content ?? []).map((c: any) => c.text ?? "").join("");
  let items: any[] = [];
  try { items = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)); }
  catch { console.error("bad_output", out.stop_reason, text.slice(0, 300)); return json({ error: "bad_output" }, 502); }

  let done = 0;
  for (const it of items) {
    const src = input.find((x) => x.slug === it?.slug);
    if (!src || !Array.isArray(it.steps_th) || !it.steps_th.length) continue;
    const { error } = await db.from("exercises").update({
      name_th: String(it.name_th || src.name).slice(0, 80),
      how_to_th: it.steps_th.map((s: unknown) => String(s).trim()).filter(Boolean).join("\n"),
    }).eq("slug", src.slug).is("how_to_th", null);
    if (!error) done++;
  }
  console.log("translated", done, "of", rows.length, "tokens", out.usage?.input_tokens, out.usage?.output_tokens);
  return json({ done });
});
