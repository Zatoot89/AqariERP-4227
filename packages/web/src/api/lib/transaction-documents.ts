import { createHash } from "node:crypto";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readPath(snapshot: Record<string, unknown>, path: string): unknown {
  let current: unknown = snapshot;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[segment];
  }
  return current ?? "";
}

export function renderTransactionHtml(
  templateHtml: string,
  snapshot: Record<string, unknown>,
): string {
  return templateHtml.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path: string) =>
    escapeHtml(readPath(snapshot, path)),
  );
}

export function checksumSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalSnapshot(value: Record<string, unknown>): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function defaultTemplateHtml(type: string, language: "en" | "ar"): string {
  const rtl = language === "ar";
  const title = rtl
    ? {
        offer: "عرض عقاري",
        reservation: "اتفاقية حجز",
        lease: "عقد إيجار",
        sale: "اتفاقية بيع",
      }[type] ?? "مستند عقاري"
    : {
        offer: "Real Estate Offer",
        reservation: "Reservation Agreement",
        lease: "Lease Agreement",
        sale: "Sale Agreement",
      }[type] ?? "Real Estate Document";
  return `<!doctype html>
<html lang="${language}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, sans-serif; color: #111827; line-height: 1.6; }
h1 { font-size: 22px; margin-bottom: 4px; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { border: 1px solid #d1d5db; padding: 8px; text-align: start; }
th { background: #f3f4f6; width: 34%; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 64px; }
.signature { border-top: 1px solid #111827; padding-top: 8px; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="meta">{{document.number}} · {{document.generatedAt}}</div>
<table>
<tr><th>${rtl ? "رقم المعاملة" : "Transaction number"}</th><td>{{transaction.number}}</td></tr>
<tr><th>${rtl ? "الحالة" : "Status"}</th><td>{{transaction.status}}</td></tr>
<tr><th>${rtl ? "العقار / الوحدة" : "Property / Unit"}</th><td>{{asset.title}}</td></tr>
<tr><th>${rtl ? "القيمة" : "Value"}</th><td>{{transaction.amount}} {{transaction.currency}}</td></tr>
<tr><th>${rtl ? "الطرف الأول" : "Primary party"}</th><td>{{parties.primary}}</td></tr>
<tr><th>${rtl ? "الطرف الثاني" : "Secondary party"}</th><td>{{parties.secondary}}</td></tr>
</table>
<p>{{transaction.terms}}</p>
<div class="signatures">
<div class="signature">${rtl ? "توقيع الطرف الأول" : "Primary party signature"}</div>
<div class="signature">${rtl ? "توقيع الطرف الثاني" : "Secondary party signature"}</div>
</div>
</body>
</html>`;
}
