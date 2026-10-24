// ประเภทเอกสารพนักงาน (ต้องตรงกับ check ในตาราง employee_documents)
export const DOC_CATEGORIES = [
  { key: "id_card", label: "สำเนาบัตรประชาชน" },
  { key: "house_registration", label: "สำเนาทะเบียนบ้าน" },
  { key: "contract", label: "สัญญาจ้าง" },
  { key: "education", label: "วุฒิการศึกษา" },
  { key: "certificate", label: "ใบรับรอง / ใบอนุญาต" },
  { key: "medical", label: "ใบรับรองแพทย์" },
  { key: "bank", label: "สำเนาสมุดบัญชี" },
  { key: "other", label: "อื่น ๆ" },
] as const;

export const DOC_LABEL: Record<string, string> = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.key, c.label]));

export const DOC_BUCKET = "employee-documents";
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx";

export function fileSize(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
