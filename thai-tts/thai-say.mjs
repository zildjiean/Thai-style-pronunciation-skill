#!/usr/bin/env node
// thai-say.mjs — turn on-screen Thai text (with English terms and numbers) into what a Thai TTS should read.
//
// As a module:  import { toSay } from "../../thai-tts/thai-say.mjs";  toSay("Cloudflare เจอ exploit 3 วัน")
//               → { say: "คลาวด์แฟลร์ เจอ เอ็กปลอย สามวัน", used: [...], unknown: [] }
//
// As a CLI (run from anywhere):
//   node thai-say.mjs "ข้อความ"               show the TTS text and any word the dictionary does not know
//   node thai-say.mjs add <term> <say> [--case] [--note "..."]    add or replace a term
//   node thai-say.mjs verify <term>           mark a term as listened-to and approved
//   node thai-say.mjs list [--unverified]     print the dictionary
//   node thai-say.mjs sample <term|text>      speak it with TokenMe TTS → samples/<name>.mp3 (to listen before verifying)
//   node thai-say.mjs check <script.json>     compare each phrase's `say` with what the dictionary would produce
//   node thai-say.mjs fill <script.json>      write `say` for phrases that have only `show`

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEXICON_PATH = join(HERE, "lexicon.json");

export const loadLexicon = (path = LEXICON_PATH) => JSON.parse(readFileSync(path, "utf8"));

// ---- numbers -------------------------------------------------------------------------------

const DIGIT = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// Read an integer below one million the Thai way (สิบเอ็ด, ยี่สิบ, หนึ่งร้อยเอ็ด).
function readChunk(n) {
  const ds = String(n).split("").reverse().map(Number);
  let out = "";
  for (let p = ds.length - 1; p >= 0; p--) {
    const d = ds[p];
    if (d === 0) continue;
    if (p === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : DIGIT[d] + "สิบ";
    else if (p === 0 && d === 1 && n > 1) out += "เอ็ด";
    else out += DIGIT[d] + PLACE[p];
  }
  return out;
}

export function readInt(n) {
  if (n === 0) return DIGIT[0];
  if (n < 1e6) return readChunk(n);
  const hi = Math.floor(n / 1e6), lo = n % 1e6;
  return readInt(hi) + "ล้าน" + (lo ? readChunk(lo) : "");
}

const readDigits = (s) => s.split("").map((d) => DIGIT[+d]).join("");

// 9.2 → เก้าจุดสอง (decimals digit by digit); 8.4.27 → แปดจุดสี่จุดยี่สิบเจ็ด (versions part by part);
// 1,000,000 → หนึ่งล้าน; 80% → แปดสิบเปอร์เซ็นต์; ids of 5+ digits (CVE numbers) digit by digit.
export function readNumber(tok) {
  const pct = tok.endsWith("%");
  const t = pct ? tok.slice(0, -1) : tok;
  let out;
  if (/^\d{1,3}(,\d{3})+$/.test(t)) out = readInt(Number(t.replace(/,/g, "")));
  else if (/^\d+\.\d+$/.test(t)) {
    const [a, b] = t.split(".");
    out = readInt(Number(a)) + "จุด" + readDigits(b);
  } else if (/^\d+(\.\d+){2,}$/.test(t)) out = t.split(".").map((x) => readInt(Number(x))).join("จุด");
  else if (/^\d{5,}$/.test(t)) out = readDigits(t);
  else out = readInt(Number(t));
  return out + (pct ? "เปอร์เซ็นต์" : "");
}

// ---- text ----------------------------------------------------------------------------------

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function toSay(text, lexicon = loadLexicon()) {
  const used = [];
  let s = text;
  // Numbers first, while their neighbours are still the written text. A count is read as part of
  // its Thai neighbours ("2 ตัว" → "สองตัว", "จาก 10" → "จากสิบ"): a space in Thai is a pause for
  // the voice. Ids (5+ digits) and versions keep their pauses. Digits inside a term (Rapid7, 2Shell)
  // are left for the dictionary.
  const TH = "\\u0E00-\\u0E7F";
  s = s.replace(
    new RegExp(`([${TH}]?) ?(?<![A-Za-z])(\\d[\\d.,]*\\d%?|\\d%?)(?![A-Za-z]) ?(?=([${TH}])?)`, "g"),
    (m, before, num, after) => {
      const glue = !/^\d{5,}$/.test(num) && !/\d\.\d+\./.test(num);
      return `${before}${before && glue ? "" : " "}${readNumber(num)}${after && glue ? "" : " "}`;
    },
  );
  // Longest terms first, so PHP2Shell wins over PHP and 2Shell. The space Thai writing puts around
  // an English word ("ด้วย PHP") is dropped too, so the voice reads it inside the sentence
  // (ทำงานด้วยพีเอชพี). A term that opens the phrase is its subject and keeps the pause after it
  // (คลาวด์แฟลร์ เจอ…). Write a space into `say` by hand anywhere else a pause is wanted.
  const terms = [...lexicon.terms].sort((a, b) => b.term.length - a.term.length);
  for (const t of terms) {
    const re = new RegExp(`([${TH}]?) ?(?<![A-Za-z0-9])${esc(t.term)}(?![A-Za-z0-9]) ?(?=([${TH}])?)`, t.case ? "g" : "gi");
    if (re.test(s)) {
      used.push(t.term);
      s = s.replace(re, (m, before, after, offset) => {
        const opens = offset === 0 && !before;
        return `${before}${before ? "" : " "}${t.say}${after && !opens ? "" : " "}`;
      });
    }
  }
  // punctuation a voice should not read: commas, separators and stray hyphens become short pauses
  s = s.replace(/[,·•→|/()"“”]/g, " ").replace(/(?<![A-Za-z])-|-(?![A-Za-z])/g, " ").replace(/\s+/g, " ").trim();
  const unknown = [...new Set(s.match(/[A-Za-z][A-Za-z0-9.\-_]*/g) || [])];
  const warnings = [];
  if (s.includes("ๆ")) warnings.push("ไม้ยมก ๆ: เขียนคำซ้ำให้ TTS เอง เช่น อะไร ๆ → อะไรอะไร");
  return { say: s, used, unknown, warnings };
}

// ---- CLI -----------------------------------------------------------------------------------

function saveLexicon(lex) {
  lex.terms.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  writeFileSync(LEXICON_PATH, JSON.stringify(lex, null, 2) + "\n");
}

function report(show, r) {
  console.log(`show: ${show}\nsay:  ${r.say}`);
  if (r.unknown.length) console.log(`  ⚠ ยังไม่มีในพจนานุกรม: ${r.unknown.join(", ")}  → node thai-say.mjs add <term> <คำอ่าน>`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
}

export const sampleName = (text) => text.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60) + ".mp3";
const mp3Seconds = (buf) => buf.length / 16000; // TokenMe mp3 is 128 kbps

async function sample(text, lex = loadLexicon()) {
  const key = (process.env.TOKENME_API_KEY || readFileSync(resolve(HERE, "../tokenme-tts-api-key.txt"), "utf8")).trim();
  const hit = lex.terms.find((t) => t.term.toLowerCase() === text.toLowerCase());
  const input = hit ? hit.say : toSay(text, lex).say;
  // the API now and then returns a clipped file; Thai speech at speed 1.0 runs under ~15 chars/s
  const minSec = input.replace(/\s/g, "").length / 15;
  let buf;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.tokenme.limited/api/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "paxa/paxa-tts-flash-v2", input, voice: "espresso", response_format: "mp3", speed: 1.0 }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TokenMe ${res.status}: ${await res.text()}`);
    buf = Buffer.from(await res.arrayBuffer());
    if (mp3Seconds(buf) >= minSec) break;
  }
  if (!buf) throw new Error(`TokenMe kept failing for "${text}"`);
  mkdirSync(join(HERE, "samples"), { recursive: true });
  const out = join(HERE, "samples", sampleName(text));
  writeFileSync(out, buf);
  return { input, out };
}

// review.html: play every sample, tick the good ones, retype the bad ones; it writes the commands to run.
// The audio is embedded so the page plays from anywhere (file://, a preview pane, a copy sent by chat).
const audioSrc = (term) => {
  const f = join(HERE, "samples", sampleName(term));
  return existsSync(f) ? "data:audio/mpeg;base64," + readFileSync(f).toString("base64") : "";
};
function writeReview(terms) {
  const rows = terms
    .map((t) => {
      const term = t.term.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return `<tr data-term="${term.replace(/"/g, "&quot;")}" data-say="${t.say}">
  <td class="term">${term}</td><td class="say">${t.say}</td>
  <td><audio controls preload="none" src="${audioSrc(t.term)}"></audio></td>
  <td><label><input type="checkbox" class="ok"> ถูก</label></td>
  <td><input type="text" class="fix" placeholder="คำอ่านที่ถูก" lang="th"></td></tr>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thai TTS Review</title>
<style>
  :root { --bg: #fafaf8; --ink: #1b1b18; --muted: #6b6b64; --line: #e3e3dd; --ok: #2f8a3e; --fix: #c2410c; --card: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151513; --ink: #eceae4; --muted: #9a9a92; --line: #2e2e2a; --ok: #4cc35f; --fix: #fb923c; --card: #1d1d1a; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 140px; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, "Sukhumvit Set", "Thonburi", sans-serif; }
  main { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { color: var(--muted); margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  td { padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: middle; }
  tr:first-child td { border-top: 0; }
  .term { font-family: ui-monospace, Menlo, monospace; font-size: 14px; white-space: nowrap; }
  .say { font-size: 18px; white-space: nowrap; }
  audio { height: 34px; width: 220px; }
  input.fix { width: 100%; min-width: 120px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); font-size: 16px; }
  tr.is-ok .say { color: var(--ok); }
  tr.is-fix .say { color: var(--fix); text-decoration: line-through; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-top: 1px solid var(--line); padding: 10px 16px; }
  .bar div { max-width: 980px; margin: 0 auto; display: flex; gap: 10px; align-items: flex-start; }
  textarea { flex: 1; height: 88px; font: 13px/1.4 ui-monospace, Menlo, monospace; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
  button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--line); background: var(--ink); color: var(--bg); font-size: 15px; cursor: pointer; }
  @media (max-width: 640px) {
    table, tbody, tr, td { display: block; width: 100%; }
    tr { border-top: 1px solid var(--line); padding: 8px 0; }
    td { border: 0; padding: 4px 10px; }
    audio { width: 100%; }
  }
</style></head><body><main>
<h1>ตรวจเสียงคำอ่าน TTS (${terms.length} คำ)</h1>
<p>กดฟังทีละคำ ถ้าเสียงถูกให้ติ๊ก "ถูก" ถ้าผิดให้พิมพ์คำอ่านที่ถูกในช่องขวา แล้วกด "คัดลอกคำสั่ง" ไปรันในโฟลเดอร์ thai-tts คำที่แก้จะได้เสียงใหม่ สร้างหน้านี้ใหม่ด้วย <code>node thai-say.mjs review</code></p>
<table><tbody>
${rows}
</tbody></table></main>
<div class="bar"><div><textarea id="cmds" readonly placeholder="คำสั่งจะขึ้นที่นี่"></textarea><button id="copy">คัดลอกคำสั่ง</button></div></div>
<script>
  const q = (s) => "'" + s.replace(/'/g, "'\\\\''") + "'";
  function build() {
    const ok = [], add = [];
    document.querySelectorAll("tr[data-term]").forEach((tr) => {
      const fix = tr.querySelector(".fix").value.trim();
      const isOk = tr.querySelector(".ok").checked && !fix;
      tr.classList.toggle("is-ok", isOk);
      tr.classList.toggle("is-fix", !!fix);
      if (fix) add.push("node thai-say.mjs add " + q(tr.dataset.term) + " " + q(fix) + " && node thai-say.mjs sample " + q(tr.dataset.term));
      else if (isOk) ok.push(q(tr.dataset.term));
    });
    const lines = [];
    if (ok.length) lines.push("node thai-say.mjs verify " + ok.join(" "));
    lines.push(...add);
    document.getElementById("cmds").value = lines.join("\\n");
  }
  document.addEventListener("input", build);
  document.addEventListener("change", build);
  document.getElementById("copy").onclick = () => {
    const t = document.getElementById("cmds");
    t.select();
    try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand("copy"); }
  };
</script></body></html>
`;
  const out = join(HERE, "review.html");
  writeFileSync(out, html);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const lex = loadLexicon();
  if (cmd === "add") {
    const [term, say] = rest;
    if (!term || !say) throw new Error('usage: add <term> <say> [--case] [--note "..."]');
    const entry = { term, say, verified: false, source: "manual" };
    if (rest.includes("--case")) entry.case = true;
    if (opt("note")) entry.note = opt("note");
    const i = lex.terms.findIndex((t) => t.term.toLowerCase() === term.toLowerCase());
    if (i >= 0) lex.terms[i] = { ...lex.terms[i], ...entry };
    else lex.terms.push(entry);
    saveLexicon(lex);
    console.log(`${i >= 0 ? "updated" : "added"}: ${term} → ${say}`);
  } else if (cmd === "verify") {
    for (const name of rest) {
      const t = lex.terms.find((x) => x.term.toLowerCase() === name.toLowerCase());
      if (!t) throw new Error(`not in dictionary: ${name}`);
      t.verified = true;
      console.log(`verified: ${t.term} → ${t.say}`);
    }
    saveLexicon(lex);
  } else if (cmd === "list") {
    const only = rest.includes("--unverified");
    for (const t of lex.terms) if (!only || !t.verified) console.log(`${t.verified ? "✓" : "·"} ${t.term.padEnd(18)} ${t.say}`);
  } else if (cmd === "sample" && rest[0] === "--unverified") {
    // every unverified term, 4 at a time, then the review page
    const todo = lex.terms.filter((t) => !t.verified);
    let done = 0;
    const queue = [...todo];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const t = queue.shift();
          await sample(t.term, lex);
          if (++done % 10 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
        }
      }),
    );
    console.log(`review page → ${writeReview(todo)}`);
  } else if (cmd === "sample") {
    const { input, out } = await sample(rest.join(" "), lex);
    console.log(`${input}\n→ ${out}`);
  } else if (cmd === "review") {
    console.log(`review page → ${writeReview(lex.terms.filter((t) => !t.verified))}`);
  } else if (cmd === "check" || cmd === "fill") {
    const path = resolve(rest[0] || "script.json");
    const script = JSON.parse(readFileSync(path, "utf8"));
    let n = 0;
    for (const line of script.lines) {
      for (const p of line.phrases) {
        const r = toSay(p.show, lex);
        if (cmd === "fill" && !p.say) {
          p.say = r.say;
          n++;
        }
        if (cmd === "check" && (r.unknown.length || r.warnings.length || p.say !== r.say)) {
          console.log(`[${line.id}] ${p.show}\n   script: ${p.say ?? "(none)"}\n   dict:   ${r.say}`);
          if (r.unknown.length) console.log(`   ⚠ unknown: ${r.unknown.join(", ")}`);
          for (const w of r.warnings) console.log(`   ⚠ ${w}`);
        }
      }
    }
    if (cmd === "fill") {
      writeFileSync(path, JSON.stringify(script, null, 2) + "\n");
      console.log(`filled ${n} phrases → ${path}`);
    }
  } else if (cmd) {
    report(cmd, toSay([cmd, ...rest].join(" "), lex));
  } else {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n"));
  }
}
