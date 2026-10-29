#!/usr/bin/env node
// variants.mjs — speak several candidate readings per term and write variants.html to pick from.
//
// Reads variants.json ({ carrier, speed, terms: [{ term, variants: [say, ...] }] }); each variant is spoken
// inside the carrier sentence (so the tone sounds like it will in a video) with the same TokenMe voice as
// the videos. Audio is embedded in the page. The page lists, for the picked readings, the
// `node thai-say.mjs add … && node thai-say.mjs verify …` commands to run in this folder.
//
// Usage: node variants.mjs            (cached clips in samples/variants/ are reused)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(HERE, "variants.json"), "utf8"));
const key = process.env.TOKENME_API_KEY || readFileSync(join(HERE, "../tokenme-tts-api-key.txt"), "utf8").trim();
const dir = join(HERE, "samples", "variants");
mkdirSync(dir, { recursive: true });

async function tts(text, attempt = 0) {
  const res = await fetch("https://api.tokenme.limited/api/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "paxa/paxa-tts-flash-v2", input: text, voice: "espresso", response_format: "mp3", speed: cfg.speed }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return tts(text, attempt + 1);
  }
  if (!res.ok) throw new Error(`TokenMe ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const rows = [];
for (const t of cfg.terms) {
  const clips = [];
  for (const v of t.variants) {
    const text = (t.carrier || cfg.carrier).replace("{v}", v);
    const f = join(dir, `${t.term.replace(/[^\p{L}\p{N}]+/gu, "_")}__${v.replace(/\s+/g, "_")}.mp3`);
    let buf = existsSync(f) ? readFileSync(f) : null;
    // the API now and then returns a clipped file; anything under ~8 KB for a sentence is refetched
    for (let a = 0; (!buf || buf.length < 8000) && a < 4; a++) {
      buf = await tts(text);
      writeFileSync(f, buf);
    }
    clips.push({ say: v, text, b64: buf.toString("base64") });
  }
  rows.push({ term: t.term, clips });
  console.log(`· ${t.term}: ${t.variants.join(" / ")}`);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const body = rows
  .map(
    (r, i) => `<section class="term" data-term="${esc(r.term)}">
  <h2>${esc(r.term)}</h2>
  <div class="opts">
${r.clips
  .map(
    (c, j) => `    <label class="opt"><input type="radio" name="t${i}" value="${esc(c.say)}"><span class="say">${esc(c.say)}</span>
      <button type="button" class="play" data-src="data:audio/mpeg;base64,${c.b64}" aria-label="ฟัง ${esc(c.say)}">▶</button></label>`,
  )
  .join("\n")}
    <label class="opt other"><input type="radio" name="t${i}" value="__other"><input class="fix" type="text" placeholder="คำอ่านอื่น…" aria-label="คำอ่านอื่นของ ${esc(r.term)}"></label>
  </div>
</section>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>เลือกคำอ่าน TTS</title>
<style>
  :root { --bg: #fafaf8; --ink: #1b1b18; --muted: #6b6b64; --line: #e3e3dd; --pick: #2f6fd6; --card: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151513; --ink: #eceae4; --muted: #9a9a92; --line: #2e2e2a; --pick: #7aa7ff; --card: #1d1d1a; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 190px; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, "Sukhumvit Set", "Thonburi", sans-serif; }
  main { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.lead { color: var(--muted); margin: 0 0 18px; }
  .term { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .term h2 { margin: 0 0 8px; font: 600 15px/1.3 ui-monospace, Menlo, monospace; }
  .opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .opt { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; cursor: pointer; }
  .opt:has(input[type=radio]:checked) { border-color: var(--pick); box-shadow: 0 0 0 2px var(--pick) inset; }
  .say { flex: 1; font-size: 19px; }
  .play { border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 999px; width: 38px; height: 38px; font-size: 15px; cursor: pointer; }
  .play.on { background: var(--pick); color: #fff; border-color: var(--pick); }
  input.fix { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); font-size: 16px; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-top: 1px solid var(--line); padding: 10px 16px; }
  .bar div { max-width: 980px; margin: 0 auto; display: flex; gap: 10px; align-items: flex-start; }
  textarea { flex: 1; height: 150px; font: 13px/1.4 ui-monospace, Menlo, monospace; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
  .bar button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--line); background: var(--ink); color: var(--bg); font-size: 15px; cursor: pointer; }
</style></head><body><main>
<h1>เลือกคำอ่านที่ถูก (${rows.length} คำ)</h1>
<p class="lead">แต่ละตัวเลือกพูดในประโยค "${esc(cfg.carrier.replace("{v}", "…"))}" ด้วยเสียง espresso ความเร็ว ${cfg.speed} เหมือนในวิดีโอ กด ▶ ฟัง แล้วเลือกอันที่ถูก ถ้าไม่มีอันไหนถูก พิมพ์คำอ่านเองในช่องสุดท้าย เสร็จแล้วกด "คัดลอก" แล้ววางข้อความในแชท</p>
${body}
</main>
<div class="bar"><div><textarea id="out" readonly aria-label="ผลที่เลือก"></textarea><button type="button" id="copy">คัดลอก</button></div></div>
<script>
  const audio = new Audio();
  let on = null;
  document.querySelectorAll(".play").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    if (on) on.classList.remove("on");
    audio.src = b.dataset.src; audio.play(); on = b; b.classList.add("on");
    const r = b.closest(".opt").querySelector("input[type=radio]"); r.checked = true; render();
  }));
  audio.addEventListener("ended", () => on && on.classList.remove("on"));
  const q = (s) => "'" + s.replace(/'/g, "'\\\\''") + "'";
  function render() {
    const lines = [];
    document.querySelectorAll(".term").forEach((sec) => {
      const r = sec.querySelector("input[type=radio]:checked");
      if (!r) return;
      const say = r.value === "__other" ? sec.querySelector("input.fix").value.trim() : r.value;
      if (!say) return;
      const t = sec.dataset.term;
      lines.push("node thai-say.mjs add " + q(t) + " " + q(say) + " && node thai-say.mjs verify " + q(t));
    });
    document.getElementById("out").value = lines.length ? "# เลือกแล้ว " + lines.length + " คำ\\n" + lines.join("\\n") : "";
  }
  document.querySelectorAll("input").forEach((i) => i.addEventListener("input", render));
  const pickOther = (i) => { i.closest(".opt").querySelector("input[type=radio]").checked = true; render(); };
  document.querySelectorAll("input.fix").forEach((i) => { i.addEventListener("focus", () => pickOther(i)); i.addEventListener("input", () => pickOther(i)); });
  document.getElementById("copy").addEventListener("click", () => { const t = document.getElementById("out"); t.select(); navigator.clipboard?.writeText(t.value); });
  render();
</script>
</body></html>
`;
writeFileSync(join(HERE, "variants.html"), html);
console.log(`✓ variants page → ${join(HERE, "variants.html")}`);
