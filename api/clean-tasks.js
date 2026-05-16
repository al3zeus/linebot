// api/clean-task.js
import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
    try {
        console.log("🧹 CLEAN TASK CRON SYSTEM");

        // 1. ดึงงานทั้งหมดที่ยังเปิดอยู่ (is_active: true) มาตรวจสอบ
        const { data: tasks, error: fetchError } = await supabase
            .from('homeworks')
            .select('id, deadline_date, subject_name')
            .eq('is_active', true);

        if (fetchError) throw fetchError;

        const now = Date.now();
        // ตั้งเวลาหมดอายุ: หลังจากเลย Deadline ไปแล้ว 3 วัน (ปรับเปลี่ยนตัวเลขวันได้ตามต้องการ)
        const EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000; 

        const expiredTaskIds = [];

        for (const task of tasks) {
            if (!task.deadline_date) continue;

            const dueTime = new Date(task.deadline_date).getTime();
            if (Number.isNaN(dueTime)) continue;

            // ถ้าระบบตรวจสอบแล้วพบว่า เวลาปัจจุบันเลยกำหนดส่งมาเกิน 3 วันแล้ว
            if (now > dueTime + EXPIRATION_MS) {
                console.log(`📌 พบงานหมดอายุ: ${task.subject_name}`);
                expiredTaskIds.push(task.id);
            }
        }

        // 2. สั่งอัปเดตสถานะงานทั้งหมดที่หมดอายุให้เป็นปิดใช้งาน (is_active: false)
        if (expiredTaskIds.length > 0) {
            const { error: updateError } = await supabase
                .from('homeworks')
                .update({ is_active: false })
                .in('id', expiredTaskIds); // อัปเดตทุกไอดีที่อยู่ใน List ทีเดียวพร้อมกัน

            if (updateError) throw updateError;
            console.log(`✅ ทำความสะอาดสำเร็จ ปิดงานเก่าไปทั้งหมด ${expiredTaskIds.length} งาน`);
        } else {
            console.log("📭 ไม่มีงานเก่าที่หมดอายุในระบบ");
        }

        return res.status(200).send("CLEAN_OK");

    } catch (err) {
        console.error("❌ CLEAN TASK ERROR:", err);
        return res.status(500).send(err.message);
    }
}