import axios from "axios";
import { db } from "../lib/firebase.js";

const sessions = {}; // memory (MVP)

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const events = body.events || [];

        for (const event of events) {
            if (event.type !== "message") continue;

            const text = event.message.text;
            const replyToken = event.replyToken;
            const userId = event.source.userId;

            if (!sessions[userId]) sessions[userId] = {};
            const s = sessions[userId];

            // =========================
            // 🟢 MENU
            // =========================
            if (["menu", "เริ่ม", "สวัสดี", "hi"].includes(text)) {
                await sendMenu(replyToken);
                continue;
            }

            // =========================
            // ➕ ADD TASK (STEP FLOW)
            // =========================
            if (text === "เพิ่มงาน") {
                s.step = 1;
                s.data = {};
                await reply(replyToken, "📘 วิชาอะไร");
                continue;
            }

            if (s.step === 1) {
                s.data.subject = text;
                s.step = 2;
                await reply(replyToken, "👨‍🏫 ชื่อครู");
                continue;
            }

            if (s.step === 2) {
                s.data.teacher = text;
                s.step = 3;
                await reply(replyToken, "📝 ชื่องาน");
                continue;
            }

            if (s.step === 3) {
                s.data.title = text;
                s.step = 4;
                await reply(replyToken, "📅 วันเวลาเริ่ม");
                continue;
            }

            if (s.step === 4) {
                s.data.start = text;
                s.step = 5;
                await reply(replyToken, "📅 วันเวลาส่ง");
                continue;
            }

            if (s.step === 5) {
                s.data.due = text;
                s.step = 6;
                await reply(replyToken, "👥 จำนวนนักเรียน");
                continue;
            }

            if (s.step === 6) {
                s.data.total = parseInt(text);

                await db.collection("tasks").add({
                    subject: s.data.subject,
                    teacher: s.data.teacher,
                    title: s.data.title,
                    start: s.data.start,
                    due: s.data.due,
                    studentsTotal: s.data.total,
                    submitted: [],
                    createdAt: new Date()
                });

                delete sessions[userId];

                await reply(replyToken, "✅ เพิ่มงานเรียบร้อย");
                continue;
            }

            // =========================
            // 📋 CHECK TASK (FLEX UI)
            // =========================
            if (text === "เช็คงาน") {
                const snap = await db.collection("tasks").get();

                if (snap.empty) {
                    await reply(replyToken, "📭 ยังไม่มีงาน");
                    continue;
                }

                const bubbles = [];

                snap.forEach((doc) => {
                    const d = doc.data();
                    const remaining = (d.studentsTotal || 0) - (d.submitted?.length || 0);

                    bubbles.push({
                        type: "bubble",
                        body: {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                {
                                    type: "text",
                                    text: d.title,
                                    weight: "bold",
                                    size: "lg"
                                },
                                {
                                    type: "text",
                                    text: `📘 วิชา: ${d.subject}`,
                                    size: "sm",
                                    color: "#666"
                                },
                                {
                                    type: "text",
                                    text: `👨‍🏫 ครู: ${d.teacher}`,
                                    size: "sm",
                                    color: "#666"
                                },
                                {
                                    type: "text",
                                    text: `❌ ยังไม่ส่ง: ${remaining}`,
                                    size: "sm",
                                    color: "#ff0000"
                                }
                            ]
                        }
                    });
                });

                await axios.post(
                    "https://api.line.me/v2/bot/message/reply",
                    {
                        replyToken,
                        messages: [
                            {
                                type: "flex",
                                altText: "รายการงาน",
                                contents: {
                                    type: "carousel",
                                    contents: bubbles
                                }
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

            await sendMenu(replyToken);
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

// =========================
// 🎨 MENU UI
// =========================
async function sendMenu(replyToken) {
    await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
            replyToken,
            messages: [
                {
                    type: "flex",
                    altText: "เมนู",
                    contents: {
                        type: "bubble",
                        body: {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                {
                                    type: "text",
                                    text: "📌 เมนูหลัก",
                                    weight: "bold",
                                    size: "xl"
                                }
                            ]
                        },
                        footer: {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                {
                                    type: "button",
                                    style: "primary",
                                    action: {
                                        type: "message",
                                        label: "➕ เพิ่มงาน",
                                        text: "เพิ่มงาน"
                                    }
                                },
                                {
                                    type: "button",
                                    action: {
                                        type: "message",
                                        label: "📋 เช็คงาน",
                                        text: "เช็คงาน"
                                    }
                                },
                                {
                                    type: "button",
                                    action: {
                                        type: "message",
                                        label: "✅ ส่งงาน",
                                        text: "ส่งแล้ว 1 12"
                                    }
                                }
                            ]
                        }
                    }
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

// =========================
// 💬 TEXT REPLY
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