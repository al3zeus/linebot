import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        console.log("🧹 CLEAN TASKS CRON START");

        const snap = await db.collection("tasks").get();

        const now = Date.now();
        let deleted = 0;

        for (const doc of snap.docs) {
            const task = doc.data();

            // =========================
            // VALIDATION
            // =========================
            if (!task.due) continue;

            const dueTime = new Date(task.due).getTime();
            if (Number.isNaN(dueTime)) continue;

            // =========================
            // DELETE CONDITION
            // =========================
            const isExpired = dueTime < now;

            if (!isExpired) continue;

            console.log("🗑 DELETE TASK:", task.subject, doc.id);

            // =========================
            // DELETE TASK
            // =========================
            await doc.ref.delete();
            deleted++;
        }

        console.log(`✅ CLEAN DONE: ${deleted} tasks deleted`);

        return res.status(200).send({
            ok: true,
            deleted
        });

    } catch (err) {
        console.error("❌ CLEAN ERROR:", err);
        return res.status(500).send("ERROR");
    }
}