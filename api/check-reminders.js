import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        console.log("🔥 CRON HIT SAFE MODE");

        const tasksSnap = await db.collection("tasks").get();
        const groupsSnap = await db.collection("groups").get();

        for (const taskDoc of tasksSnap.docs) {
            const task = taskDoc.data();
            const reminders = task.reminders || [];

            for (const r of reminders) {
                const now = new Date();
                const remindTime = new Date(r.time);

                if (remindTime > now) continue;

                const logKey = r.key;

                // =========================
                // 🛡️ CHECK LOG (ANTI-SPAM CORE)
                // =========================
                const logRef = db.collection("reminder_logs").doc(logKey);
                const logSnap = await logRef.get();

                if (logSnap.exists) {
                    console.log("⛔ SKIP (already sent):", logKey);
                    continue;
                }

                console.log("🚀 SEND:", task.subject, r.type);

                // =========================
                // SEND TO ALL GROUPS
                // =========================
                for (const g of groupsSnap.docs) {
                    const groupId = g.data().groupId;

                    await sendLineMessage(
                        groupId,
                        `📌 งาน: ${task.subject}\n📝 ${task.content}\n⏰ เตือน: ${r.type}`
                    );
                }

                // =========================
                // MARK AS SENT (GLOBAL LOCK)
                // =========================
                await logRef.set({
                    taskId: taskDoc.id,
                    type: r.type,
                    sentAt: new Date()
                });
            }
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error("❌ CRON ERROR:", err);
        res.status(500).send(err.message);
    }
}

// =========================
async function sendLineMessage(to, text) {
    return axios.post(
        "https://api.line.me/v2/bot/message/push",
        {
            to,
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