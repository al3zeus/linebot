// api/check-remainder.js
import axios from "axios";
import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
    try {
        console.log("🔥 SMART REMINDER CRON SYSTEM");

        // 1. ดึงงานทั้งหมดที่ยังเปิดอยู่ (is_active: true)
        const { data: tasks, error: tasksError } = await supabase
            .from('homeworks')
            .select('*')
            .eq('is_active', true);

        if (tasksError) throw tasksError;

        const now = Date.now();

        // 2. วนลูปตรวจสอบงานแต่ละชิ้น
        for (const task of tasks) {
            // ถ้างานชิ้นนี้ไม่มีข้อมูลกลุ่มแชท หรือไม่มีวันส่ง ให้ข้ามไปก่อน
            if (!task.line_group_id || !task.deadline_date) continue;

            const dueTime = new Date(task.deadline_date).getTime();
            if (Number.isNaN(dueTime)) continue;

            // ตั้งเวลาแจ้งเตือนล่วงหน้าอัตโนมัติ
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
                // ⏱️ เงื่อนไขที่ 1: ตรวจสอบว่าถึงเวลาแจ้งเตือนในลูปปัจจุบันหรือยัง และต้องไม่เก่าเกิน 30 นาที (ป้องกันยิงย้อนหลัง)
                if (now < r.time || now > r.time + 30 * 60 * 1000) {
                    continue;
                }

                // สร้าง Unique Key ป้องกันการเตือนซ้ำ (อิงตาม ID หลักของงาน และคีย์เวลา)
                const logKey = `${task.id}_${r.key}`;

                // ตรวจสอบในตาราง reminder_logs ว่าเคยส่งเตือนชิ้นนี้ไปหรือยัง
                const { data: existingLog, error: logError } = await supabase
                    .from('reminder_logs')
                    .select('log_key')
                    .eq('log_key', logKey)
                    .maybeSingle();

                if (logError) throw logError;

                // ⛔ เงื่อนไขที่ 2: ถ้าเจอบันทึกเดิม แปลว่าเตือนไปแล้ว -> ดีดตัวข้ามรอบของลูปย่อยนี้ทันที
                if (existingLog) {
                    console.log("⛔ SKIP DUPLICATE REMINDER:", logKey);
                    continue; 
                }

                // 🚀 ย้ายบล็อกคำสั่งส่งข้อความและบันทึก Log เข้ามาอยู่ข้างในลูปย่อย 
                // เพื่อให้สัมพันธ์กับการสั่ง continue ด้านบนอย่างถูกต้อง
                try {
                    console.log("🚀 SEND REMINDER:", task.subject_name, r.type);

                    // รูปแบบข้อความแจ้งเตือนในกลุ่มไลน์
                    const message = `📌 งาน: ${task.subject_name}\n📝 ${task.content}\n⏰ เตือน: ${r.type}`;

                    // ยิงแจ้งเตือนกลับไปยังกลุ่มไลน์ต้นทางของงานชิ้นนั้นๆ
                    await sendLineMessage(task.line_group_id, message);

                    // บันทึก Log ลงตารางป้องกันบอทยิงซ้ำรอบหน้า
                    const { error: insertLogError } = await supabase
                        .from('reminder_logs')
                        .insert([{
                            log_key: logKey,
                            task_id: task.id,
                            reminder_type: r.type
                        }]);

                    if (insertLogError) throw insertLogError;

                } catch (sendError) {
                    console.error(`❌ Failed to send or log reminder for ${logKey}:`, sendError);
                    // ปล่อยให้ลูปวนทำงานต่อกับงานอื่นได้ ไม่ให้ระบบค้าง
                }
            }
        }

        return res.status(200).send("OK");

    } catch (err) {
        console.error("❌ CRON ERROR:", err);
        return res.status(500).send(err.message);
    }
}

// ฟังก์ชันยิงแจ้งเตือนตรงเข้ากลุ่มไลน์
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