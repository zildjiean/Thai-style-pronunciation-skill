# Thai-style pronunciation skill

Skill และเครื่องมือสำหรับทำเสียงพากย์ TTS ภาษาไทย ให้อ่านคำอังกฤษ ตัวย่อ และตัวเลขแบบที่คนไทยพูดจริง (ใส่วรรณยุกต์ตามเสียงพูด ไม่ใช่ตามหลักราชบัณฑิตฯ)

## ในนี้มีอะไร

| โฟลเดอร์ | ใช้ทำอะไร |
|---|---|
| `thai-tts-cyber-news-video/SKILL.md` | Skill สำหรับ Claude: เปลี่ยนลิงก์ข่าวไซเบอร์เป็นสคริปต์ TTS ภาษาไทย + ข้อความบนจอ ใช้กับ ElevenLabs, Paxa Labs และ TokenMe พร้อมอภิธานศัพท์คำอ่าน |
| `thai-tts/` | พจนานุกรมคำอ่านที่ใช้ร่วมทุกวิดีโอ (`lexicon.json`) และเครื่องมือ `thai-say.mjs` (แปลงซับเป็นคำอ่าน, เพิ่ม/ยืนยันคำ, ทำเสียงตัวอย่าง) กับ `variants.mjs` (สร้างหน้าให้ฟังคำอ่านหลายแบบแล้วเลือก) ดูวิธีใช้ใน `thai-tts/README.md` |

## ติดตั้ง skill

- **claude.ai:** zip โฟลเดอร์ `thai-tts-cyber-news-video/` แล้วอัปโหลดใน Settings → Capabilities → Skills
- **Claude Code:** คัดลอกโฟลเดอร์ `thai-tts-cyber-news-video/` ไปไว้ที่ `~/.claude/skills/`

## ใช้เครื่องมือ thai-tts

ต้องมี Node.js 18 ขึ้นไป คำสั่งที่สร้างเสียงจะเรียก TokenMe TTS (`paxa/paxa-tts-flash-v2`) โดยอ่านคีย์จาก `$TOKENME_API_KEY` หรือจากไฟล์ `../tokenme-tts-api-key.txt` (โฟลเดอร์แม่ของ `thai-tts/`) ห้าม commit คีย์ ไฟล์นี้อยู่ใน `.gitignore` แล้ว

```bash
cd thai-tts
node thai-say.mjs "Cloudflare เจอ exploit 3 วัน"   # ดูคำอ่าน
node thai-say.mjs list --unverified                 # คำที่ยังไม่มีใครฟังยืนยัน
node variants.mjs                                   # สร้าง variants.html ให้ฟังและเลือก
```

`verified: true` ใน `lexicon.json` หมายถึงมีคนฟังเสียงจริงแล้วว่าถูกต้อง
