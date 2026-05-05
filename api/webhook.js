import axios from "axios";
import { db } from "../lib/firebase.js";

const BOT_NAME = "KBComSci";

/* =========================
   DATE PARSER (ROBUST)
========================= */
function parseFlexibleDate(input) {
    if (!input) return null;

    input = String(input).trim();

    let date = null;

    // dd/mm/yyyy or dd/mm/yyyy hh:mm
    const m = input.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/
    );

    if (m) {
        let [, d, mo, y, h = "0", min = "0"] = m;

        d = Number(d);
        mo = Number(mo) - 1;
        y = Number(y);
        h = Number(h);
        min = Number(min);

        if (y > 3000) y -= 543;

        return new Date(y, mo, d, h, min);
    }

    // fallback ISO / string date
    date = new Date(input);

    if (isNaN(date.getTime())) return null;

    if (date.getFullYear() > 3000) {
        date.setFullYear(date.getFullYear() - 543);
    }

    return date;
}

/* =========================
   FORMAT DATE (FIX DISPLAY)
========================= */
function formatDate(date) {
    if (!date) return "⛔ ไม่ระบุเวลา";

    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();

    const hh = date.getHours();
    const mm = date.getMinutes();

    const hasTime = hh !== 0 || mm !== 0;

    if (hasTime) {
        return `${d}/${m}/${y} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    return `${d}/${m}/${y}`;
}

/* =========================
   HANDLER
========================= */
export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }

        const body = typeof req.body === "string"
            ? JSON.parse(req.body)
            : req.body;

        const events = body.events || [];

        for (const event of events) {

            if (event.type !== "message") continue;
            if (!event.message || event.message.type !== "text") continue;

            const rawText = (event.message.text || "").trim();

            if (!rawText.includes(BOT_NAME)) continue;

            let text = rawText
                .replace(/@\S+\s?/g, "")
                .trim();

            const replyToken = event.replyToken;

            /* =========================
               ADD TASK
            ========================= */
            if (text.startsWith("เพิ่มงาน")) {

                const lines = text
                    .replace(/\u00A0/g, " ")
                    .split("\n")
                    .map(l => l.trim())
                    .filter(Boolean);

                if (lines.length < 7) {
                    return reply(replyToken, "❌ ต้องมี 7 บรรทัด");
                }

                const subject = lines[1];
                const teacher = lines[2];
                const content = lines[3];

                const dueDate = parseFlexibleDate(lines[4]);
                const start = lines[5];
                const total = Number(lines[6]);

                if (!dueDate) return reply(replyToken, "❌ วันที่ไม่ถูกต้อง");
                if (!Number.isFinite(total)) {
                    return reply(replyToken, "❌ จำนวนต้องเป็นตัวเลข");
                }

                const snap = await db.collection("tasks").get();
                const taskNo = snap.size + 1;

                await db.collection("tasks").add({
                    taskNo,
                    subject,
                    teacher,
                    content,
                    due: dueDate.getTime(),
                    start,
                    studentsTotal: total,
                    submitted: [],
                    createdAt: new Date()
                });

                return reply(replyToken, `✅ เพิ่มงานแล้ว (#${taskNo})`);
            }

            /* =========================
               CHECK TASK
            ========================= */
            if (text === "เช็คงาน") {

                const snap = await db.collection("tasks")
                    .orderBy("taskNo", "asc")
                    .get();

                if (snap.empty) {
                    return reply(replyToken, "📭 ไม่มีงาน");
                }

                let msg = "📋 งานทั้งหมด\n\n";

                for (const doc of snap.docs) {
                    const t = doc.data();

                    const date = new Date(t.due);
                    const dateText = isNaN(date.getTime())
                        ? "⛔ ไม่ระบุเวลา"
                        : formatDate(date);

                    msg += `📌 ${t.taskNo}. ${t.subject}\n`;
                    msg += `👨‍🏫 ${t.teacher}\n`;
                    msg += `📅 ${dateText}\n\n`;
                }

                return reply(replyToken, msg);
            }

            return reply(replyToken, "พิมพ์ KBComSci ? เพื่อดูวิธีใช้");
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

/* =========================
   REPLY
========================= */
async function reply(token, message) {
    return axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
            replyToken: token,
            messages: [{ type: "text", text: message }]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}