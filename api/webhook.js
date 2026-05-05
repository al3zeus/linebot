import axios from "axios";
import { db } from "../lib/firebase.js";

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

            // =========================
            // 🟢 MENU
            // =========================
            if (["menu", "เริ่ม", "สวัสดี", "hi"].includes(text)) {
                await sendMenu(replyToken);
                continue;
            }

            // =========================
            // ➕ เพิ่มงาน
            // =========================
            if (text === "เพิ่มงาน") {
                await reply(replyToken, "📘 ใส่วิชา เช่น คณิตศาสตร์");
                continue;
            }

            if (text.startsWith("วิชา ")) {
                const subject = text.replace("วิชา ", "");

                await db.collection("tasks").add({
                    subject,
                    title: "ยังไม่ระบุ",
                    teacher: "",
                    studentsTotal: 0,
                    submitted: [],
                    createdAt: new Date()
                });

                await reply(replyToken, "📌 เพิ่มวิชาแล้ว (ต่อยอดระบบได้)");
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

                    msg += `${i + 1}. ${d.subject}\n`;
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

            // =========================
            // fallback
            // =========================
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