import axios from "axios";
import { db, admin } from "../lib/firebase.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    const body =
        typeof req.body === "string"
            ? JSON.parse(req.body)
            : req.body || {};

    const events = body.events || [];

    for (const event of events) {
        if (event.type !== "message") continue;
        if (event.message.type !== "text") continue;

        const text = event.message.text.trim();
        const replyToken = event.replyToken;
        const userId = event.source?.userId;

        // =========================
        // ❓ HELP COMMAND
        // =========================
        if (text === "?" || text === "help") {
            return reply(replyToken,
`📌 วิธีใช้บอท

➕ เพิ่มงาน
เพิ่มงาน
วิชา
ครู
ชื่องาน
วันเวลาเริ่ม
วันเวลาส่ง

📋 ดูงาน
เช็คงาน

✅ ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่นักเรียน>`
            );
        }

        // =========================
        // ➕ เพิ่มงาน (ใช้ newline)
        // =========================
        if (text.startsWith("เพิ่มงาน")) {
            const parts = text.split("\n").map(s => s.trim());

            if (parts.length < 6) {
                return reply(replyToken,
`❌ รูปแบบไม่ถูกต้อง

ใช้:
เพิ่มงาน
วิชา
ครู
ชื่องาน
วันสั่ง เวลา
วันส่ง`
                );
            }

            const subject = parts[1];
            const teacher = parts[2];
            const title = parts[3];
            const assignDate = parts[4];
            const dueDate = parts[5];

            await db.collection("tasks").add({
                subject,
                teacher,
                title,
                assignDate,
                dueDate,
                submitted: [],
                createdBy: userId,
                createdAt: new Date()
            });

            return reply(replyToken, "เพิ่มงานเรียบร้อย ✔");
        }

        // =========================
        // 📋 เช็คงาน
        // =========================
        if (text === "เช็คงาน") {
            const snap = await db.collection("tasks").get();

            if (snap.empty) {
                return reply(replyToken, "ไม่มีงานตอนนี้");
            }

            let msg = "📋 รายการงาน\n\n";
            let i = 1;

            snap.forEach(doc => {
                const d = doc.data();
                const status = d.submitted.length === 0
                    ? "❌ ยังไม่มีคนส่ง"
                    : `✔ ส่งแล้ว ${d.submitted.length}`;

                msg += `${i}. ${d.title}\n`;
                msg += `วิชา: ${d.subject}\n`;
                msg += `${status}\n\n`;

                i++;
            });

            return reply(replyToken, msg);
        }

        // =========================
        // ✅ ส่งงาน
        // =========================
        if (text.startsWith("ส่งแล้ว")) {
            const parts = text.split(" ");
            const taskNumber = parseInt(parts[1]);
            const studentId = parts[2];

            const snap = await db.collection("tasks").get();
            const docs = snap.docs;

            if (taskNumber < 1 || taskNumber > docs.length) {
                return reply(replyToken, "ไม่พบงานนี้");
            }

            const ref = docs[taskNumber - 1].ref;

            await ref.update({
                submitted: admin.firestore.FieldValue.arrayUnion(studentId)
            });

            return reply(replyToken, "ส่งงานแล้ว ✔");
        }

        // =========================
        // default
        // =========================
        return reply(replyToken, `คุณพิมพ์: ${text}`);
    }

    res.status(200).send("OK");
}

// =========================
// reply function
// =========================
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