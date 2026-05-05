import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
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
            // CHECK TASK (UI)
            // =========================
            if (text === "เช็คงาน") {
                const snap = await db.collection("tasks").get();

                if (snap.empty) {
                    return reply(replyToken, "📭 ยังไม่มีงาน");
                }

                const messages = [];

                snap.forEach(doc => {
                    const data = doc.data();
                    data.id = doc.id;
                    messages.push(taskUI(data));
                });

                await axios.post(
                    "https://api.line.me/v2/bot/message/reply",
                    {
                        replyToken,
                        messages
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
                            "Content-Type": "application/json"
                        }
                    }
                );

                continue;
            }

            // =========================
            // SUBMIT TASK
            // =========================
            if (text.startsWith("ส่งแล้ว")) {
                const parts = text.split(/\s+/);

                const taskId = parts[1];
                const studentId = parts[2];

                if (!taskId || !studentId) {
                    return reply(replyToken, "❌ ใช้: ส่งแล้ว <เลขงาน> <เลขที่>");
                }

                const docRef = db.collection("tasks").doc(taskId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const data = doc.data();

                if (!data.pending) data.pending = [];

                data.pending.push({
                    studentId,
                    status: "pending"
                });

                await docRef.update({ pending: data.pending });

                return reply(replyToken, "📌 กรุณารอเพื่อนอนุมัติสักครู่");
            }

            // =========================
            // VERIFY VOTE
            // =========================
            if (text.startsWith("verify")) {
                const parts = text.split(/\s+/);

                const action = parts[1]; // yes / no
                const taskId = parts[2];
                const studentId = parts[3];

                const docRef = db.collection("tasks").doc(taskId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const data = doc.data();

                if (!data.verify) data.verify = {};

                if (!data.verify[studentId]) {
                    data.verify[studentId] = { yes: 0, no: 0 };
                }

                if (action === "yes") {
                    data.verify[studentId].yes += 1;
                } else {
                    data.verify[studentId].no += 1;
                }

                await docRef.update({ verify: data.verify });

                return reply(replyToken, "✔ บันทึกแล้ว");
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
// FLEX UI: TASK CARD
// =========================
function taskUI(task) {
    const remaining = (task.studentsTotal || 0) - (task.submitted?.length || 0);

    return {
        type: "flex",
        altText: "งาน",
        contents: {
            type: "bubble",
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: task.subject || "ไม่มีชื่อวิชา",
                        weight: "bold",
                        size: "lg"
                    },
                    {
                        type: "text",
                        text: task.content || "-",
                        wrap: true,
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: `👨‍🏫 ${task.teacher || "-"}`,
                        size: "xs",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: `📅 ${task.due || "-"}`,
                        size: "xs"
                    },
                    {
                        type: "text",
                        text: `❌ ยังไม่ส่ง: ${remaining}`,
                        size: "xs",
                        color: "#FF5551",
                        margin: "md"
                    }
                ]
            }
        }
    };
}

// =========================
// REPLY
// =========================
async function reply(token, message) {
    return axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
            replyToken: token,
            messages: [
                typeof message === "string"
                    ? { type: "text", text: message }
                    : message
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}