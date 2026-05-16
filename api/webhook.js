// api/webhook.js
import axios from "axios";
// 🎯 1. เปลี่ยนมา Import จากเซนเตอร์กลางที่เตรียมไว้
import { supabase } from "../lib/supabase.js"; 

const BOT_NAME = "KBComSci";

/* =========================
   DATE PARSER (SAFE)
========================= */
function parseFlexibleDate(input) {
    if (!input) return null;
    input = String(input).trim();

    const m = input.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/
    );

    if (m) {
        let [, d, mo, y, h = 0, min = 0] = m;
        d = Number(d);
        mo = Number(mo) - 1;
        y = Number(y);

        if (y > 3000) y -= 543; // Buddhist year fix
        return new Date(y, mo, d, Number(h), Number(min));
    }

    const d = new Date(input);
    if (isNaN(d.getTime())) return null;

    if (d.getFullYear() > 3000) {
        d.setFullYear(d.getFullYear() - 543);
    }
    return d;
}

/* =========================
   FORMAT DATE
========================= */
function formatDate(dateString) {
    if (!dateString) return "⛔ ไม่ระบุเวลา";
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "⛔ ไม่ระบุเวลา";

    return date.toLocaleString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/* =========================
   MAIN HANDLER
========================= */
export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }

        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const events = body.events || [];

        for (const event of events) {
            if (event.type !== "message") continue;
            if (!event.message || event.message.type !== "text") continue;

            const rawText = (event.message.text || "").trim();
            if (!rawText.includes(BOT_NAME)) continue;

            let text = rawText.replace(/@\S+\s?/g, "").trim();
            const replyToken = event.replyToken;

            /* =========================
               HELP (?)
            ========================= */
            if (text === "?") {
                return reply(replyToken,
`📌 วิธีใช้

➕ เพิ่มงาน
เพิ่มงาน
วิชา
ครู
เนื้อหา
กำหนดส่ง (dd/mm/yyyy hh:mm)
วันที่สั่ง
จำนวนนักเรียน

📤 ส่งงาน
ส่งแล้ว <เลขงาน> <เลขที่>

📋 เช็คงาน
เช็คงาน

📋 เช็คคน
เช็คคน <เลขงาน>`);
            }

            /* =========================
               ADD TASK (เพิ่มงาน)
            ========================= */
            if (text.startsWith("เพิ่มงาน")) {
                const lines = text
                    .replace(/\u00A0/g, " ")
                    .split("\n")
                    .map(l => l.trim())
                    .filter(Boolean);

                if (lines.length < 7) {
                    return reply(replyToken, "❌ ต้องมี 7 บรรทัด");
                }

                const subject = lines[1];
                const teacher = lines[2];
                const content = lines[3];
                const dueDate = parseFlexibleDate(lines[4]);
                const start = lines[5];
                const total = Number(lines[6]);

                if (!dueDate) {
                    return reply(replyToken, "❌ วันที่ไม่ถูกต้อง");
                }

                if (!Number.isFinite(total)) {
                    return reply(replyToken, "❌ จำนวนนักเรียนต้องเป็นตัวเลข");
                }

                // 🎯 2. ดักจับ ID กลุ่มไลน์/ห้องแชท อัตโนมัติจาก Event ต้นทาง
                const sourceId = event.source.groupId || event.source.roomId || event.source.userId;

                const { count, error: countError } = await supabase
                    .from('homeworks')
                    .select('*', { count: 'exact', head: true });

                if (countError) throw countError;
                const taskNo = (count || 0) + 1;

                // บันทึกลง Supabase
                const { error: insertError } = await supabase
                    .from('homeworks')
                    .insert([{
                        task_no: taskNo,
                        subject_name: subject,
                        teacher_name: teacher,
                        content: content,
                        deadline_date: dueDate.toISOString(),
                        assign_date: start,
                        class_size: total,
                        submitted: [],
                        line_group_id: sourceId // 🎯 3. เพิ่มฟิลด์เก็บ ID สำหรับใช้ส่งแจ้งเตือนภัยแบบอัตโนมัติ
                    }]);

                if (insertError) throw insertError;

                return reply(replyToken, `✅ เพิ่มงานสำเร็จ\n📌 เลขงาน: ${taskNo}`);
            }

            /* =========================
               SUBMIT TASK (ส่งแล้ว)
            ========================= */
            if (text.startsWith("ส่งแล้ว")) {
                const parts = text.split(/\s+/);
                const taskNo = Number(parts[1]);
                const studentId = Number(parts[2]);

                if (!Number.isInteger(taskNo) || !Number.isInteger(studentId)) {
                    return reply(replyToken, "❌ ส่งแล้ว <เลขงาน> <เลขที่>");
                }

                const { data: task, error: fetchError } = await supabase
                    .from('homeworks')
                    .select('id, submitted')
                    .eq('task_no', taskNo)
                    .maybeSingle();

                if (fetchError) throw fetchError;
                if (!task) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                let currentSubmitted = task.submitted || [];
                if (!currentSubmitted.includes(studentId)) {
                    currentSubmitted.push(studentId);
                }

                const { error: updateError } = await supabase
                    .from('homeworks')
                    .update({ submitted: currentSubmitted })
                    .eq('id', task.id);

                if (updateError) throw updateError;

                return reply(replyToken, "📌 ส่งงานแล้ว");
            }

            /* =========================
               CHECK TASK (เช็คงาน)
            ========================= */
            if (text === "เช็คงาน") {
                const { data: tasks, error: selectError } = await supabase
                    .from('homeworks')
                    .select('*')
                    .eq('is_active', true)
                    .order('task_no', { ascending: true });

                if (selectError) throw selectError;

                if (!tasks || tasks.length === 0) {
                    return reply(replyToken, "📭 ยังไม่มีงาน");
                }

                let msg = "📋 งานทั้งหมด\n\n";

                for (const t of tasks) {
                    const dateText = formatDate(t.deadline_date);
                    msg += `📌 ${t.task_no}. ${t.subject_name}\n`;
                    msg += `👨‍🏫 ${t.teacher_name || 'ไม่ระบุ'}\n`;
                    msg += `📅 ${dateText}\n\n`;
                }

                return reply(replyToken, msg);
            }

            /* =========================
               CHECK PEOPLE (เช็คคน)
            ========================= */
            if (text.startsWith("เช็คคน")) {
                const parts = text.split(/\s+/);
                const taskNo = Number(parts[1]);

                if (!Number.isInteger(taskNo)) {
                    return reply(replyToken, "❌ ใช้: เช็คคน <เลขงาน>");
                }

                const { data: task, error: checkError } = await supabase
                    .from('homeworks')
                    .select('submitted, class_size')
                    .eq('task_no', taskNo)
                    .maybeSingle();

                if (checkError) throw checkError;
                if (!task) {
                    return reply(replyToken, "❌ ไม่พบงาน");
                }

                const submitted = task.submitted || [];
                const missing = [];

                for (let i = 1; i <= (task.class_size || 0); i++) {
                    if (!submitted.includes(i)) {
                        missing.push(i);
                    }
                }

                return reply(
                    replyToken,
                    missing.length
                        ? `❌ ยังไม่ส่ง: ${missing.join(", ")}`
                        : "🎉 ส่งครบแล้ว"
                );
            }

            return reply(replyToken, "พิมพ์ ? เพื่อดูวิธีใช้");
        }

        res.status(200).send("OK");

    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

/* =========================
   REPLY
========================= */
async function reply(token, message) {
    return axios.post(
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