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

            // =========================
            // HELP
            // =========================
            if (text === "?") {
                return reply(replyToken,
`📌 วิธีใช้

➕ เพิ่มงาน (วางทีเดียว 7 บรรทัด)

เพิ่มงาน
วิชา
ครู
เนื้อหา
กำหนดส่ง
วันที่สั่ง
จำนวนนักเรียน

📋 เช็คงาน
เช็คงาน

📤 ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่>

📋 เช็คคน
เช็คคน <เลขงาน>`);
            }

            // =========================
            // ADD TASK
            // =========================
            if (text.startsWith("เพิ่มงาน")) {
                const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

                if (lines.length < 7) {
                    return reply(replyToken,
`❌ รูปแบบไม่ถูกต้อง

ต้องมี 7 บรรทัด:
วิชา / ครู / เนื้อหา / กำหนดส่ง / วันที่สั่ง / จำนวน`);
                }

                const subject = lines[1];
                const teacher = lines[2];
                const content = lines[3];
                const due = lines[4];
                const start = lines[5];
                const total = Number(lines[6]);

                if (!Number.isInteger(total)) {
                    return reply(replyToken, "❌ จำนวนนักเรียนต้องเป็นตัวเลข");
                }

                const docRef = await db.collection("tasks").add({
                    subject,
                    teacher,
                    content,
                    due,
                    start,
                    studentsTotal: total,
                    submitted: [],
                    createdAt: new Date()
                });

                return reply(replyToken,
                    `✅ เพิ่มงานสำเร็จ\n📌 เลขงาน: ${docRef.id}`);
            }

            // =========================
            // SUBMIT TASK (FIXED NA N)
            // =========================
            if (text.startsWith("ส่งแล้ว")) {

                const parts = text.trim().split(/\s+/);

                const taskIndex = Number(parts[1]);
                const studentId = Number(parts[2]);

                if (!Number.isInteger(taskIndex) || !Number.isInteger(studentId)) {
                    return reply(replyToken, "❌ ใช้: ส่งแล้ว <เลขงาน> <เลขที่>");
                }

                const snap = await db.collection("tasks")
                    .orderBy("createdAt", "asc")
                    .get();

                const docs = snap.docs;

                if (taskIndex < 1 || taskIndex > docs.length) {
                    return reply(replyToken, "❌ ไม่พบงานลำดับนี้");
                }

                const doc = docs[taskIndex - 1];
                const task = doc.data();

                if (!task.submitted) task.submitted = [];

                if (!task.submitted.includes(studentId)) {
                    task.submitted.push(studentId);
                }

                await doc.ref.update({
                    submitted: task.submitted
                });

                return reply(replyToken, "📌 ส่งงานแล้ว");
            }

            // =========================
            // CHECK TASK
            // =========================
            if (text === "เช็คงาน") {

                const snap = await db.collection("tasks")
                    .orderBy("createdAt", "asc")
                    .get();

                if (snap.empty) {
                    return reply(replyToken, "📭 ยังไม่มีงาน");
                }

                let msg = "📋 งานทั้งหมด\n\n";

                snap.forEach((doc, i) => {
                    const t = doc.data();

                    msg += `📌 ${i + 1}. ${t.subject}\n`;
                    msg += `👨‍🏫 ${t.teacher}\n`;
                    msg += `📅 ${t.due}\n\n`;
                });

                return reply(replyToken, msg);
            }

            // =========================
            // CHECK PEOPLE
            // =========================
            if (text.startsWith("เช็คคน")) {

                const parts = text.split(/\s+/);
                const taskIndex = Number(parts[1]);

                const snap = await db.collection("tasks")
                    .orderBy("createdAt", "asc")
                    .get();

                const docs = snap.docs;

                if (!Number.isInteger(taskIndex) || taskIndex < 1 || taskIndex > docs.length) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const task = docs[taskIndex - 1].data();

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