import axios from "axios";
import { db, admin } from "../lib/firebase.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    const body = typeof req.body === "string"
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
        // HELP
        // =========================
        if (text === "?") {
            return reply(replyToken,
`📌 วิธีใช้

➕ เพิ่มงาน
เพิ่มงาน
วิชา
ครู
ชื่องาน
วันเวลาเริ่ม
วันเวลาส่ง
จำนวนนักเรียน

📋 เช็คงาน
เช็คงาน

✅ ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่>`
            );
        }

        // =========================
        // ADD TASK
        // =========================
        if (text.startsWith("เพิ่มงาน")) {
            const parts = text.split("\n").map(s => s.trim());

            if (parts.length < 7) {
                return reply(replyToken, "❌ รูปแบบไม่ถูกต้อง");
            }

            const subject = parts[1];
            const teacher = parts[2];
            const title = parts[3];
            const start = parts[4];
            const due = parts[5];
            const totalStudents = parseInt(parts[6]);

            if (isNaN(totalStudents)) {
                return reply(replyToken, "❌ จำนวนคนไม่ถูกต้อง");
            }

            await db.collection("tasks").add({
                subject,
                teacher,
                title,
                start,
                due,
                totalStudents,
                submitted: [],
                notified24h: false,
                notified1h: false,
                createdAt: new Date()
            });

            return reply(replyToken, "✔ เพิ่มงานเรียบร้อย");
        }

        // =========================
        // CHECK TASK
        // =========================
        if (text === "เช็คงาน") {
            const snap = await db.collection("tasks").get();

            if (snap.empty) {
                return reply(replyToken, "ไม่มีงาน");
            }

            let msg = "📋 รายการงาน\n\n";
            let i = 1;

            snap.forEach(doc => {
                const d = doc.data();
                const remain = d.totalStudents - (d.submitted?.length || 0);

                msg += `${i}. ${d.title}\n`;
                msg += `วิชา: ${d.subject}\n`;
                msg += `✔ ${d.submitted.length}/${d.totalStudents}\n`;
                msg += `❌ เหลือ ${remain}\n\n`;

                i++;
            });

            return reply(replyToken, msg);
        }

        // =========================
        // SUBMIT
        // =========================
        if (text.startsWith("ส่งแล้ว")) {
            const parts = text.split(" ");
            const taskIndex = parseInt(parts[1]);
            const studentId = parts[2];

            const snap = await db.collection("tasks").get();
            const docs = snap.docs;

            if (taskIndex < 1 || taskIndex > docs.length) {
                return reply(replyToken, "ไม่พบงาน");
            }

            const ref = docs[taskIndex - 1].ref;

            await ref.update({
                submitted: admin.firestore.FieldValue.arrayUnion(studentId)
            });

            return reply(replyToken, "✔ ส่งงานแล้ว");
        }

        return reply(replyToken, `คุณพิมพ์: ${text}`);
    }

    res.status(200).send("OK");
}

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