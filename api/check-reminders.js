import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        console.log("🔥 CRON HIT");

        // =========================
        // 1. GET ALL TASKS
        // =========================
        const snap = await db.collection("tasks").get();

        console.log("📦 TASKS:", snap.size);

        // =========================
        // 2. LOOP TASKS
        // =========================
        for (const doc of snap.docs) {
            const task = doc.data();

            console.log("📌 TASK:", task.title);

            const reminders = task.reminders || [];
            let changed = false;

            // =========================
            // 3. CHECK REMINDERS
            // =========================
            for (let r of reminders) {
                const now = new Date();
                const remindTime = new Date(r.time);

                console.log("⏰ CHECK:", r.type, r.sent);

                if (!r.sent && remindTime <= now) {

                    console.log("🚀 SEND:", task.title, r.type);

                    await sendLineMessage(
                        `📌 งาน: ${task.title}\n⏰ เตือน: ${r.type}`
                    );

                    r.sent = true;
                    changed = true;
                }
            }

            // =========================
            // 4. UPDATE FIRESTORE
            // =========================
            if (changed) {
                await doc.ref.update({ reminders });
            }
        }

        return res.status(200).send("OK");

    } catch (err) {
        console.error("❌ CRON ERROR:", err);
        return res.status(500).send(err.message);
    }
}

// =========================
// LINE PUSH FUNCTION
// =========================
async function sendLineMessage(text) {
    return axios.post(
        "https://api.line.me/v2/bot/message/push",
        {
            to: process.env.LINE_USER_ID, // เปลี่ยนเป็น userId จริงหรือ loop users ทีหลัง
            messages: [
                {
                    type: "text",
                    text
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