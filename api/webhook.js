import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const events = body.events || [];

        for (const event of events) {
            if (event.type !== "message") continue;

            const text = event.message.text.trim();
            const replyToken = event.replyToken;

            // =========================
            // ❓ HELP
            // =========================
            if (text === "?") {
                await reply(replyToken,
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
                continue;
            }

            // =========================
            // ➕ ADD TASK (PHASE INPUT)
            // =========================
            if (text.startsWith("เพิ่มงาน")) {
                const lines = text.split("\n").map(l => l.trim());

                // ต้องมีอย่างน้อย 7 บรรทัด
                if (lines.length < 7) {
                    await reply(replyToken,
`❌ รูปแบบไม่ถูกต้อง

📌 ต้องใส่แบบนี้:

เพิ่มงาน
วิชา
ผู้สอน
เนื้อหางาน
กำหนดส่ง
วันที่สั่ง
จำนวนสมาชิก

พิมพ์ ? เพื่อดูวิธีใช้`);
                    continue;
                }

                const [, subject, teacher, content, due, start, total] = lines;

                if (!subject || !teacher || !content || !due || !start || !total) {
                    await reply(replyToken, "❌ ข้อมูลไม่ครบ พิมพ์ ? เพื่อดูรูปแบบ");
                    continue;
                }

                await db.collection("tasks").add({
                    subject,
                    teacher,
                    content,
                    due,
                    start,
                    studentsTotal: parseInt(total),
                    submitted: [],
                    createdAt: new Date()
                });

                await reply(replyToken, "✅ เพิ่มงานเรียบร้อย");
                continue;
            }

            // =========================
            // 📋 CHECK TASK
            // =========================
            if (text === "เช็คงาน") {
                const snap = await db.collection("tasks").get();

                if (snap.empty) {
                    await reply(replyToken, "📭 ยังไม่มีงาน");
                    continue;
                }

                let msg = "📋 รายการงาน\n\n";

                snap.forEach((doc, i) => {
                    const d = doc.data();
                    const remaining = (d.studentsTotal || 0) - (d.submitted?.length || 0);

                    msg += `${i + 1}. ${d.subject}\n`;
                    msg += `👨‍🏫 ${d.teacher}\n`;
                    msg += `📝 ${d.content}\n`;
                    msg += `📅 ส่ง: ${d.due}\n`;
                    msg += `❌ เหลือ: ${remaining}\n\n`;
                });

                await reply(replyToken, msg);
                continue;
            }

            // =========================
            // ✅ SUBMIT TASK
            // =========================
            if (text.startsWith("ส่งแล้ว")) {
                const parts = text.split(" ");
                const index = parseInt(parts[1]);
                const studentId = parseInt(parts[2]);

                const snap = await db.collection("tasks").get();
                const doc = snap.docs[index - 1];

                if (!doc) {
                    await reply(replyToken, "❌ ไม่พบงาน");
                    continue;
                }

                const data = doc.data();

                if (!data.submitted.includes(studentId)) {
                    data.submitted.push(studentId);
                    await doc.ref.update({ submitted: data.submitted });
                }

                await reply(replyToken, "✅ ส่งงานแล้ว");
                continue;
            }

            await reply(replyToken, "พิมพ์ ? เพื่อดูวิธีใช้");
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

// =========================
async function reply(token, message) {
    await axios.post(
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