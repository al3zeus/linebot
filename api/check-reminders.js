import axios from "axios";
import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        console.log("🔥 SMART REMINDER CRON");

        const tasksSnap = await db.collection("tasks").get();
        const groupsSnap = await db.collection("groups").get();

        const now = Date.now();

        for (const taskDoc of tasksSnap.docs) {
            const task = taskDoc.data();

            if (!task.due) continue;

            const dueTime = new Date(task.due).getTime();
            if (Number.isNaN(dueTime)) continue;

            // =========================
            // DEFINE REMINDERS (AUTO)
            // =========================
            const reminders = [
                {
                    type: "1 วันก่อนส่ง",
                    time: dueTime - 24 * 60 * 60 * 1000,
                    key: "1d"
                },
                {
                    type: "3 ชั่วโมงก่อนส่ง",
                    time: dueTime - 3 * 60 * 60 * 1000,
                    key: "3h"
                }
            ];

            for (const r of reminders) {

                // =========================
                // CHECK TIME
                // =========================
                if (now < r.time) continue;

                // =========================
                // UNIQUE KEY (NO DUPLICATE)
                // =========================
                const logKey = `${taskDoc.id}_${r.key}`;

                const logRef = db.collection("reminder_logs").doc(logKey);
                const logSnap = await logRef.get();

                if (logSnap.exists) {
                    console.log("⛔ SKIP:", logKey);
                    continue;
                }

                console.log("🚀 SEND:", task.subject, r.type);

                // =========================
                // MESSAGE
                // =========================
                const message = `📌 งาน: ${task.subject}
📝 ${task.content}
⏰ เตือน: ${r.type}`;

                // =========================
                // SEND TO ALL GROUPS
                // =========================
                const sendPromises = groupsSnap.docs.map(g => {
                    const groupId = g.data().groupId;
                    return sendLineMessage(groupId, message);
                });

                await Promise.all(sendPromises);

                // =========================
                // LOCK LOG
                // =========================
                await logRef.set({
                    taskId: taskDoc.id,
                    type: r.type,
                    sentAt: new Date()
                });
            }
        }

        return res.status(200).send("OK");

    } catch (err) {
        console.error("❌ CRON ERROR:", err);
        return res.status(500).send(err.message);
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