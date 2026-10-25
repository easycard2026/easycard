import { Field, SubmitButton, inputClass } from "@/components/form";

export type ShiftRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  break_start: string | null;
  late_grace_minutes: number;
};

const t = (v?: string | null) => (v ? v.slice(0, 5) : "");

// ฟอร์มเพิ่ม/แก้กะ ใช้ร่วมกันทั้งสองหน้า
export function ShiftForm({ shift, action }: { shift?: ShiftRow; action: (formData: FormData) => Promise<void> }) {
  const noBreak = shift ? shift.break_minutes === 0 : false;
  return (
    <form action={action} className="space-y-5">
      {shift && <input type="hidden" name="id" value={shift.id} />}
      <Field label="ชื่อกะ">
        <input name="name" required maxLength={60} defaultValue={shift?.name} placeholder="เช่น กะเช้า" className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="เวลาเข้างาน">
          <input type="time" name="start_time" required defaultValue={t(shift?.start_time) || "08:00"} className={inputClass} />
        </Field>
        <Field label="เวลาเลิกงาน" hint="เลิกก่อนเวลาเข้า = กะข้ามเที่ยงคืน">
          <input type="time" name="end_time" required defaultValue={t(shift?.end_time) || "17:00"} className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 p-3.5">
        <legend className="px-1 text-[13px] font-medium text-zinc-700">เวลาพัก</legend>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-700">
          <input type="checkbox" name="no_break" defaultChecked={noBreak} className="peer size-4 accent-zinc-900" />
          ไม่มีเวลาพัก
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="พักกี่นาที">
            <input
              type="number"
              name="break_minutes"
              min={0}
              max={719}
              step={5}
              defaultValue={shift ? (noBreak ? 60 : shift.break_minutes) : 60}
              className={inputClass}
            />
          </Field>
          <Field label="เริ่มพักเวลา" hint="ไม่บังคับ">
            <input type="time" name="break_start" defaultValue={t(shift?.break_start)} className={inputClass} />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">
          ใส่เวลาเริ่มพัก = หักเฉพาะช่วงพักที่อยู่ในเวลาทำงานจริง (เช่น ทำครึ่งเช้าไม่ถูกหัก) · เว้นว่าง = หักตามจำนวนนาทีเมื่อทำงานเกิน 5 ชม.
        </p>
      </fieldset>

      <Field label="ผ่อนผันมาสาย (นาที)" hint="เข้างานช้าไม่เกินนี้ ไม่นับว่าสาย">
        <input type="number" name="late_grace_minutes" min={0} max={240} defaultValue={shift?.late_grace_minutes ?? 0} className={inputClass} />
      </Field>

      <div className="flex justify-end border-t border-zinc-100 pt-4">
        <SubmitButton>{shift ? "บันทึก" : "เพิ่มกะ"}</SubmitButton>
      </div>
    </form>
  );
}
