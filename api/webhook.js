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

            const text = event.message.text.trim();
            const replyToken = event.replyToken;
            const userId = event.source.userId;

            // =========================
            // HELP
            // =========================
            if (text === "?") {
                await reply(replyToken,
`📌 วิธีใช้

➕ เพิ่มงาน
เพิ่มงาน
วิชา
ผู้สอน
เนื้อหา
กำหนดส่ง
วันที่สั่ง
จำนวนนักเรียน

📋 เช็คงาน
เช็คงาน

📤 ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่>

✔ ยืนยัน
จริง <เลขงาน> <เลขที่>

📋 เช็คคน
เช็คคน <เลขงาน>`);
                continue;
            }

            // =========================
            // ADD TASK
            // =========================
            if (text === "เพิ่มงาน") {
                sessions[userId] = { step: 1, data: {} };
                await reply(replyToken, "📘 วิชา");
                continue;
            }

            const s = sessions[userId];

            if (s?.step === 1) {
                s.data.subject = text;
                s.step = 2;
                await reply(replyToken, "👨‍🏫 ผู้สอน");
                continue;
            }

            if (s?.step === 2) {
                s.data.teacher = text;
                s.step = 3;
                await reply(replyToken, "📝 เนื้อหา");
                continue;
            }

            if (s?.step === 3) {
                s.data.content = text;
                s.step = 4;
                await reply(replyToken, "📅 กำหนดส่ง");
                continue;
            }

            if (s?.step === 4) {
                s.data.due = text;
                s.step = 5;
                await reply(replyToken, "📅 วันที่สั่ง");
                continue;
            }

            if (s?.step === 5) {
                s.data.start = text;
                s.step = 6;
                await reply(replyToken, "👥 จำนวนนักเรียน");
                continue;
            }

            if (s?.step === 6) {
                s.data.total = parseInt(text);

                await db.collection("tasks").add({
                    subject: s.data.subject,
                    teacher: s.data.teacher,
                    content: s.data.content,
                    due: s.data.due,
                    start: s.data.start,
                    studentsTotal: s.data.total,
                    submitted: [],
                    verify: {},
                    createdAt: new Date()
                });

                delete sessions[userId];

                await reply(replyToken, "✅ เพิ่มงานเรียบร้อย");
                continue;
            }

            // =========================
            // SUBMIT (PENDING VERIFY)
            // =========================
            if (text.startsWith("ส่งแล้ว")) {
                const [, taskIndex, studentId] = text.split(" ");

                const snap = await db.collection("tasks").get();
                const doc = snap.docs[parseInt(taskIndex) - 1];

                if (!doc) return reply(replyToken, "❌ ไม่พบงาน");

                const task = doc.data();

                if (!task.verify) task.verify = {};

                if (!task.verify[studentId]) {
                    task.verify[studentId] = { voters: [], verified: false };
                }

                await doc.ref.update({ verify: task.verify });

                await reply(replyToken, "📌 รอการยืนยัน");
                continue;
            }

            // =========================
            // VERIFY VOTE
            // =========================
            if (text.startsWith("จริง")) {
                const [, taskIndex, studentId] = text.split(" ");

                const snap = await db.collection("tasks").get();
                const doc = snap.docs[parseInt(taskIndex) - 1];

                if (!doc) return reply(replyToken, "❌ ไม่พบงาน");

                const task = doc.data();

                if (!task.verify) task.verify = {};
                if (!task.verify[studentId]) {
                    task.verify[studentId] = { voters: [], verified: false };
                }

                const v = task.verify[studentId];

                if (!v.voters.includes(userId)) {
                    v.voters.push(userId);
                }

                if (v.voters.length >= 5) {
                    v.verified = true;

                    if (!task.submitted.includes(parseInt(studentId))) {
                        task.submitted.push(parseInt(studentId));
                    }
                }

                await doc.ref.update({
                    verify: task.verify,
                    submitted: task.submitted
                });

                await reply(replyToken, "✔ ยืนยันแล้ว");
                continue;
            }

            // =========================
            // 📋 CHECK TASK (UI SECTION)
            // =========================
            if (text === "เช็คงาน") {
                const snap = await db.collection("tasks").get();

                if (snap.empty) {
                    await reply(replyToken, "📭 ยังไม่มีงาน");
                    continue;
                }

                const messages = [];

                snap.forEach((doc, i) => {
                    messages.push(taskUI(i + 1, doc.data()));
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
            // CHECK PEOPLE
            // =========================
            if (text.startsWith("เช็คคน")) {
                const [, taskIndex] = text.split(" ");

                const snap = await db.collection("tasks").get();
                const doc = snap.docs[parseInt(taskIndex) - 1];

                if (!doc) return reply(replyToken, "❌ ไม่พบงาน");

                const task = doc.data();

                const missing = [];

                for (let i = 1; i <= task.studentsTotal; i++) {
                    if (!task.submitted.includes(i)) {
                        missing.push(i);
                    }
                }

                await reply(
                    replyToken,
                    missing.length
                        ? `❌ ยังไม่ส่ง: ${missing.join(", ")}`
                        : "🎉 ส่งครบแล้ว"
                );

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
    return axios.post(
        "https://api.line.me/v2/bot/message/reply", // ✅ FIX ตรงนี้
        {
            replyToken: token,
            messages: [
                {
                    type: "text",
                    text: message
                }
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

function taskUI(taskIndex, task) {
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
                        text: task.subject,
                        weight: "bold",
                        size: "lg"
                    },
                    {
                        type: "text",
                        text: task.content,
                        wrap: true,
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: `👨‍🏫 ${task.teacher}`,
                        size: "xs",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: `📅 ส่ง: ${task.due}`,
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
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "message",
                            label: "📤 ส่งงาน",
                            text: `ส่งแล้ว ${taskIndex} 1`
                        }
                    },
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "message",
                            label: "✔ ยืนยันงาน",
                            text: `จริง ${taskIndex} 1`
                        }
                    },
                    {
                        type: "button",
                        style: "link",
                        action: {
                            type: "message",
                            label: "📋 เช็คคน",
                            text: `เช็คคน ${taskIndex}`
                        }
                    }
                ]
            }
        }
    };
}

function verifyUI(taskIndex, studentId) {
    return {
        type: "flex",
        altText: "ยืนยันงาน",
        contents: {
            type: "bubble",
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `งาน #${taskIndex}`,
                        weight: "bold",
                        size: "lg"
                    },
                    {
                        type: "text",
                        text: `เลขที่ ${studentId}`,
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "คุณคิดว่าเขาส่งงานจริงไหม?",
                        wrap: true,
                        size: "sm",
                        margin: "md"
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "message",
                            label: "✔ จริง",
                            text: `จริง ${taskIndex} ${studentId}`
                        }
                    },
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "message",
                            label: "❌ ไม่จริง",
                            text: `ไม่จริง ${taskIndex} ${studentId}`
                        }
                    }
                ]
            }
        }
    };
}