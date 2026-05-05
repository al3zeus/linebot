import axios from "axios";
import { db } from "../lib/firebase.js";

// memory ชั่วคราว (MVP)
const sessions = {};

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

            const text = event.message.text;
            const replyToken = event.replyToken;
            const userId = event.source.userId;

            if (!sessions[userId]) sessions[userId] = {};

            const session = sessions[userId];

            // =========================
            // MENU
            // =========================
            if (text === "menu" || text === "เริ่ม" || text === "สวัสดี") {
                await sendMenu(replyToken);
                continue;
            }

            // =========================
            // ➕ เพิ่มงาน FLOW
            // =========================
            if (text === "เพิ่มงาน") {
                session.step = 1;
                session.data = {};
                await reply(replyToken, "📘 วิชาอะไร");
                continue;
            }

            if (session.step === 1) {
                session.data.subject = text;
                session.step = 2;
                await reply(replyToken, "👨‍🏫 ครูชื่ออะไร");
                continue;
            }

            if (session.step === 2) {
                session.data.teacher = text;
                session.step = 3;
                await reply(replyToken, "📝 ชื่องานอะไร");
                continue;
            }

            if (session.step === 3) {
                session.data.title = text;
                session.step = 4;
                await reply(replyToken, "📅 วันเวลาเริ่ม (YYYY-MM-DD HH:mm)");
                continue;
            }

            if (session.step === 4) {
                session.data.start = text;
                session.step = 5;
                await reply(replyToken, "📅 วันเวลาส่ง (YYYY-MM-DD HH:mm)");
                continue;
            }

            if (session.step === 5) {
                session.data.due = text;
                session.step = 6;
                await reply(replyToken, "👥 จำนวนนักเรียน");
                continue;
            }

            if (session.step === 6) {
                session.data.total = parseInt(text);

                // SAVE FIREBASE
                await db.collection("tasks").add({
                    subject: session.data.subject,
                    teacher: session.data.teacher,
                    title: session.data.title,
                    start: session.data.start,
                    due: session.data.due,
                    studentsTotal: session.data.total,
                    submitted: [],
                    createdAt: new Date()
                });

                delete sessions[userId];

                await reply(replyToken, "✅ เพิ่มงานเรียบร้อย");
                continue;
            }

            // =========================
            // 📋 เช็คงาน
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

                    msg += `${i + 1}. ${d.title}\n`;
                    msg += `วิชา: ${d.subject}\n`;
                    msg += `ครู: ${d.teacher}\n`;
                    msg += `❌ ยังไม่ส่ง: ${remaining} คน\n\n`;
                });

                await reply(replyToken, msg);
                continue;
            }

            // =========================
            // ✅ ส่งงาน
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

                    await doc.ref.update({
                        submitted: data.submitted
                    });
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

async function sendMenu(replyToken) {
    await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
            replyToken,
            messages: [
                {
                    type: "text",
                    text: "📌 เมนูหลัก",
                    quickReply: {
                        items: [
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "➕ เพิ่มงาน",
                                    text: "เพิ่มงาน"
                                }
                            },
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "📋 เช็คงาน",
                                    text: "เช็คงาน"
                                }
                            },
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "✅ ส่งงาน",
                                    text: "ส่งแล้ว 1 12"
                                }
                            }
                        ]
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