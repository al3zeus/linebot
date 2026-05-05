import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    // 1. รับเฉพาะ POST จาก LINE
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        // 2. parse body (กันพังบน Vercel)
        const body =
            typeof req.body === "string"
                ? JSON.parse(req.body)
                : req.body || {};

        const events = body.events || [];

        // 3. loop events จาก LINE
        for (const event of events) {
            if (event.type !== "message") continue;
            if (!event.message || event.message.type !== "text") continue;

            const text = event.message.text;
            const replyToken = event.replyToken;
            const userId = event.source?.userId;

            // =========================
            // 4. LOGIC BOT
            // =========================

            // 🔹 คำสั่ง: เพิ่มงาน
            if (text === "เพิ่มงาน") {
                await reply(replyToken, "เริ่มเพิ่มงาน ✍️\nวิชาอะไร?");

                // (optional) เก็บ state ไว้ก่อน
                await db.collection("sessions").doc(userId).set({
                    step: "ask_subject"
                }, { merge: true });
            }

            // 🔹 default reply
            else {
                await reply(replyToken, `คุณพิมพ์: ${text}`);

                // 🔸 ตัวอย่าง save ลง Firestore (ลองของจริง)
                await db.collection("messages").add({
                    userId,
                    text,
                    createdAt: new Date()
                });
            }
        }

        return res.status(200).send("OK");
    } catch (err) {
        console.error("Webhook Error:", err);
        return res.status(500).send("Internal Server Error");
    }
}

// =========================
// Reply function
// =========================
async function reply(token, message) {
    return axios.post(
        "https://api.line.me/v2/bot/message/reply",
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