import axios from "axios";
import { db } from "../lib/firebase.js";

const sessions = {};

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const events = body.events || [];

        for (const event of events) {
            if (event.type !== "message") continue;

            const text = (event.message.text || "").trim();
            const replyToken = event.replyToken;
            const userId = event.source.userId;

            // =========================
            // HELP
            // =========================
            if (text === "?") {
                return reply(replyToken,
`📌 วิธีใช้

➕ เพิ่มงาน (วางทีเดียว 7 บรรทัด)

เพิ่มงาน
<วิชา>
<ผู้สอน>
<เนื้อหางาน>
<กำหนดส่ง>
<วันที่สั่ง>
<จำนวนสมาชิก>

📋 เช็คงาน
เช็คงาน

✅ ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่>`);
            }

            // =========================
            // ADD TASK (SESSION)
            // =========================
            if (text === "เพิ่มงาน") {
                sessions[userId] = { step: 1, data: {} };
                return reply(replyToken, "📘 วิชาอะไร?");
            }

            const s = sessions[userId];

            if (s?.step === 1) {
                s.data.subject = text;
                s.step = 2;
                return reply(replyToken, "👨‍🏫 ครูชื่ออะไร?");
            }

            if (s?.step === 2) {
                s.data.teacher = text;
                s.step = 3;
                return reply(replyToken, "📝 เนื้อหางาน?");
            }

            if (s?.step === 3) {
                s.data.content = text;
                s.step = 4;
                return reply(replyToken, "📅 กำหนดส่ง?");
            }

            if (s?.step === 4) {
                s.data.due = text;
                s.step = 5;
                return reply(replyToken, "📅 วันที่สั่ง?");
            }

            if (s?.step === 5) {
                s.data.start = text;
                s.step = 6;
                return reply(replyToken, "👥 จำนวนนักเรียน?");
            }

            if (s?.step === 6) {
                s.data.total = parseInt(text);

                const docRef = await db.collection("tasks").add({
                    subject: s.data.subject,
                    teacher: s.data.teacher,
                    content: s.data.content,
                    due: s.data.due,
                    start: s.data.start,
                    studentsTotal: s.data.total,
                    submitted: [],
                    createdAt: new Date()
                });

                delete sessions[userId];

                return reply(replyToken, `✅ เพิ่มงานสำเร็จ\n📌 taskId: ${docRef.id}`);
            }

            // =========================
            // SUBMIT TASK
            // =========================
            if (text.startsWith("ส่งแล้ว")) {
                const parts = text.split(/\s+/);

                const taskId = parts[1];
                const studentId = parseInt(parts[2]);

                if (!taskId || !studentId) {
                    return reply(replyToken, "❌ ใช้: ส่งแล้ว <taskId> <เลขที่>");
                }

                const docRef = db.collection("tasks").doc(taskId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const data = doc.data();

                if (!data.submitted.includes(studentId)) {
                    data.submitted.push(studentId);
                }

                await docRef.update({
                    submitted: data.submitted
                });

                return reply(replyToken, "📌 ส่งงานแล้ว (รอครูตรวจ)");
            }

            // =========================
            // CHECK TASK
            // =========================
            if (text === "เช็คงาน") {
                const snap = await db.collection("tasks").get();

                if (snap.empty) {
                    return reply(replyToken, "📭 ยังไม่มีงาน");
                }

                let msg = "📋 งานทั้งหมด\n\n";

                snap.forEach(doc => {
                    const t = doc.data();
                    msg += `📌 ${t.subject}\n`;
                    msg += `👨‍🏫 ${t.teacher}\n`;
                    msg += `📅 ${t.due}\n`;
                    msg += `🆔 ${doc.id}\n\n`;
                });

                return reply(replyToken, msg);
            }

            // =========================
            // CHECK PEOPLE NOT SUBMIT
            // =========================
            if (text.startsWith("เช็คคน")) {
                const parts = text.split(/\s+/);
                const taskId = parts[1];

                const doc = await db.collection("tasks").doc(taskId).get();

                if (!doc.exists) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const task = doc.data();

                const missing = [];

                for (let i = 1; i <= task.studentsTotal; i++) {
                    if (!task.submitted.includes(i)) {
                        missing.push(i);
                    }
                }

                return reply(
                    replyToken,
                    missing.length
                        ? `❌ ยังไม่ส่ง: ${missing.join(", ")}`
                        : "🎉 ส่งครบแล้ว"
                );
            }

            return reply(replyToken, "พิมพ์ ? เพื่อดูวิธีใช้");
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

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