import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    const now = new Date();

    const snap = await db.collection("tasks").get();

    for (const doc of snap.docs) {
        const task = doc.data();

        const due = new Date(task.due);
        const diff = due - now;
        const hoursLeft = diff / (1000 * 60 * 60);

        // =========================
        // 24 hours alert
        // =========================
        if (hoursLeft <= 24 && !task.notified24h) {
            await pushAll(`📌 งาน "${task.title}" เหลือ 1 วัน`);

            await doc.ref.update({ notified24h: true });
        }

        // =========================
        // 1 hour alert
        // =========================
        if (hoursLeft <= 1 && !task.notified1h) {
            await pushAll(`🚨 งาน "${task.title}" เหลือ 1 ชั่วโมง`);

            await doc.ref.update({ notified1h: true });
        }
    }

    res.status(200).send("OK");
}

async function pushAll(message) {
    const users = await db.collection("users").get();

    for (const u of users.docs) {
        await axios.post(
            "https://api.line.me/v2/bot/message/push",
            {
                to: u.id,
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
}