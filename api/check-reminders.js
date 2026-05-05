import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    const now = new Date();

    const snap = await db.collection("tasks").get();

    for (const doc of snap.docs) {
        const task = doc.data();
        const reminders = task.reminders || [];

        let changed = false;

        for (let r of reminders) {
            if (!r.sent && new Date(r.time) <= now) {

                await sendLineMessage(
                    `📌 งาน "${task.title}" ถึงเวลาแจ้งเตือน (${r.type})`
                );

                r.sent = true;
                changed = true;
            }
        }

        if (changed) {
            await doc.ref.update({ reminders });
        }
    }

    res.status(200).send("OK");
}

async function sendLineMessage(text) {
    await axios.post(
        "https://api.line.me/v2/bot/message/push",
        {
            to: "ALL_USERS",
            messages: [{ type: "text", text }]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}