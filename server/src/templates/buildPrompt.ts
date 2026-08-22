import type {DocTemplate, TemplateField} from "../../src/shared/types.js";

export interface InspectorProfile {
  company_name?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  inspector_number?: string | null;
  personal_phone?: string | null;
  personal_email?: string | null;
  personal_name?: string | null;
  personal_company_name?: string | null;
}

const TYPE_DESCRIPTIONS: Record<TemplateField["type"], string> = {
  text: "string | null",
  number: "number | null",
  date: '"YYYY-MM-DD" | null  (Hebrew calendar → Gregorian; DD/MM/YYYY → ISO)',
  phone: 'string | null  (keep original Israeli format, e.g. "050-1234567")',
  email: "string | null",
  currency: "number | null",
  list: "string[]  (empty array if none)",
};

/**
 * Build a Hebrew-aware system prompt for OpenAI/Ollama based on the user's template.
 * The prompt asks the model to return ONE flat JSON object whose keys are the
 * template's field `key`s.
 */
export function buildPromptForTemplate(tpl: DocTemplate, inspector?: InspectorProfile): string {
  const fieldLines = tpl.fields
    .map((f) => {
      const parts: string[] = [];
      parts.push(`  "${f.key}": ${TYPE_DESCRIPTIONS[f.type]}`);
      const hints: string[] = [];
      hints.push(`label: "${f.label_he}"`);
      if (f.required) hints.push("required");
      if (f.hint_he) hints.push(`hint: ${f.hint_he}`);
      if (f.example_he) hints.push(`example: ${f.example_he}`);
      parts.push(`    // ${hints.join(" · ")}`);
      return parts.join("\n");
    })
    .join(",\n");

  const expiryNote = tpl.expiry_field
    ? `\nIMPORTANT: the field "${tpl.expiry_field}" represents the FUTURE DATE the user must be reminded about. Always pick the next-action date, NOT the issue date.`
    : "";

  const isInspectionTemplate = tpl.match_keywords.some((k) =>
    ["תסקיר", "בדיקה תקופתית", "בדיקה", "ציוד הרמה", "פקודת הבטיחות"].includes(k)
  );
  const isInvoiceTemplate = tpl.document_kind === "invoice" || tpl.match_keywords.some((k) =>
    /invoice|receipt|bill|חשבונית|קבלה|דרישת\s*תשלום|חיוב/i.test(k)
  );
  const shouldExtractEquipment = isInspectionTemplate && (tpl as any).extract_equipment !== false;
  const equipmentSection = shouldExtractEquipment
    ? `\n  "_equipment": [   // Extract EVERY equipment row from the inspection table — one object per row.
    // IMPORTANT — multiple serial numbers on one row:
    //   Some items (e.g. רצועות הרמה, שאקל) list several serial numbers separated by / or space.
    //   Create ONE object per serial number so each gets its own record.
    //   Copy name/manufacturer/model/loads to each sibling object.
    //
    // IMPORTANT — merged-cell tables (one item, multiple load sub-rows):
    //   Some tables use merged cells where description/manufacturer/model/serial appear ONCE
    //   but the load columns repeat for different configurations or radii (e.g. "על במה" vs "על מרפסת").
    //   In this case create ONE object per equipment item and put each load sub-row as a separate
    //   element in the load_capacity_work / load_capacity_test / load_radius arrays.
    //   Example: load_capacity_work = ["320 ק\"ג (2 אנשים + ציוד)", "113 ק\"ג (עובד אחד + ציוד)"]
    //            load_capacity_test = ["100 ק\"ג"]
    //            load_radius = ["על במה", "על מרפסת"]
    //   Do NOT create duplicate objects for the same serial number — merge sub-rows instead.
    //   When there is only one load value, still use an array with one element.
    {
      "name": string,                   // תיאור / "תיאור" column — full description text of the equipment item. BiDi note: may appear as "ראית" or "רואית" in reversed text — still map to this field.
      "manufacturer": string | null,    // יצרן
      "model": string | null,           // דגם (keep Latin model codes as-is, e.g. "SLR-CLU")
      "serial_number": string | null,   // מספר סידורי / "מס' סידורי" — ONE serial per object; keep mixed Hebrew+Latin as-is. BiDi note: column header may appear reversed as "ירודיס 'סמ" or "ירודיס רפסמ" — still map values in that column to serial_number. EXCEPTION: for category="accessory" (אביזרי הרמה), serial_number is often not present — do not force a value, use null.
      "load_capacity_work": string[],   // עומס עבודה בטוח — extract ONLY from the equipment table column/header "עומס עבודה בטוח (ק\"ג)" or equivalent. One entry per load configuration, include units and context exactly as written, e.g. ["230 ק\"ג - עד 2 אנשים בבמה", "115 ק\"ג - אדם אחד בלבד"]. Empty array if not present.
      "load_capacity_test": string[],   // עומס מבחן / "ומס מבחן" — test load. BiDi note: column header may appear reversed as "ןחבמ סמוע" or "ןחבמ סמ" — still map values to load_capacity_test. Include ק\"ג units. Empty array if not present.
      "load_radius": string[],          // רדיוס עומס — one entry per radius. Empty array if not present.
      "category": "lift" | "accessory" | "scaffold" | "ladder" | "balloon" | "intake" | "extractor" | "other"
      // category guidance:
      //   lift        → מגבה, מנוף, עגורן, מעלית, גיטרה, במת הרמה
      //   accessory   → אביזר הרמה, רצועה, ווי, גלגלת, שרשרת, שאקל, container lifter, SLR
      //   scaffold    → פיגום, דפנה
      //   ladder      → סולם
      //   balloon     → מעלון, מרים
      //   other       → anything else
    }
  ]  // IMPORTANT: extract ALL rows; empty array only if truly no equipment.`
    : "";
  const invoiceSection = isInvoiceTemplate
    ? `\n• Invoice / receipt English label handling:
  - English invoice titles and labels are authoritative. Map them directly:
    "Invoice number" → invoice_number, "Receipt number" → invoice_number or receipt_number,
    "Date of issue" → issue_date, "Date paid" → issue_date and payment_status="paid",
    "Date due" / "Amount due" due date → payment_due_date,
    "Bill to" / "Account billed" → client_company/client_name,
    "Total" / "Amount due" / "Amount paid" → amount,
    "Subtotal" → amount_before_vat, "Tax" / "VAT" → vat_amount,
    "Payment method" / "Charged to" → payment_method.
  - Preserve English values exactly when they are real values, e.g. supplier "Vercel Inc.", client "Pavel Arshavsky's projects", payment method "Mastercard - 8021".
  - Currency must be a 3-letter ISO code: USD, ILS, EUR, GBP. If the document says "$", "USD", or an amount line like "11.25 USD", return currency="USD". Never convert USD amounts to ILS and never return "ש\"ח" for a USD document.
  - For amount, prefer the final paid/due value in this order: Amount paid, Amount due, Total, then Subtotal. Do not use Tax/VAT as amount.
  - For receipts, use document_subtype="קבלה"; for invoices, use document_subtype="חשבונית".`
    : "";

  const inspectorExclusionNote = buildInspectorExclusionNote(inspector);

  return `You are a document intelligence assistant specializing in Hebrew business documents.
The user has defined a template called "${tpl.name}". Extract structured information
from the provided document text and return ONLY ONE valid JSON object whose keys
match the schema below EXACTLY.

GENERAL RULES:
• All dates must be normalized to ISO 8601 (YYYY-MM-DD). Hebrew calendar → convert to Gregorian. Israeli DD/MM/YYYY → YYYY-MM-DD.
• Phone numbers: keep original Israeli format (e.g. "050-1234567"). If the number appears as 10 consecutive digits with no dash (e.g. "0537285690"), insert the dash after the 3rd digit → "053-7285690".
• Email addresses: Hebrew PDFs sometimes output email addresses in reversed visual order, e.g. "il.co1945.shelev@klodin" which is actually "klodin@shelev1945.co.il". Recognize a reversed email by checking whether the part after "@" looks like a name/word and the part before "@" looks like a domain (contains dots and a TLD like .co.il / .com / .org). If reversed, swap the two parts around "@".
• Report number: report_number / "מספר תסקיר" is the CURRENT report number only. If the text also contains "מספר תסקיר קודם", "תסקיר קודם", or "previous report", do NOT use that previous value for report_number. Example: "מספר תסקיר: 17924/484590" and "מספר תסקיר קודם: 161748/340" means report_number="17924/484590".
• Client company names may contain numbers. Never drop numbers that are part of a company name. Example: "מולטיפק פלסטיק 1990" must stay exactly with "1990" in client_company.
• Inspection equipment summary fields:
  - equipment_description / "תיאור" is the general description value. If the document shows "תיאור מכונת הרמה", return equipment_description="מכונת הרמה"; do NOT put the full phrase "תיאור מכונת הרמה" in the value and do NOT use the detailed equipment table row here.
  - checked_equipment / "ציוד שנבדק" is the specific checked item, usually the first equipment table/item description such as "מלגזה חשמלית".
• Contact fields for inspection reports:
  - contact_person, contact_phone, and contact_email must come from the CLIENT / HOLDER details block in the BODY of the report, preferably the first details block near labels such as "פרטי הלקוח/תופש", "איש קשר", "נייד", "טלפון", "מייל", "שם מעביד / בעל הציוד".
  - Example from a client block: "איש קשר: בר", "נייד: 053-8801490", "מייל: benitaliftingplat@gmail.com" means contact_person="בר", contact_phone="053-8801490", contact_email="benitaliftingplat@gmail.com".
  - If several phone/email values appear, prefer the one closest to those client/contact labels in the upper/body data section. Never take contact_person/phone/email from the page footer, inspector signature, legal disclaimer, or final instructions block.
• If a field cannot be determined, use null (or [] for list types).
• Do not invent data. Do not add fields not in the schema.
• The text may have residual bidi/encoding artifacts from PDF extraction — use context.
${invoiceSection}
• BiDi table columns: Hebrew PDFs often reverse the order of column header words in equipment tables.
  Common reversed headers and their correct mapping:
    "ירודיס 'סמ" / "ירודיס רפסמ"  →  מספר סידורי  →  serial_number
    "ןחבמ סמוע" / "ןחבמ (ג\"ק) סמוע"  →  עומס מבחן  →  load_capacity_test
    "חוטב הדובע סמוע"  →  עומס עבודה בטוח  →  load_capacity_work
    "ראית" / "רואית"  →  תיאור  →  name
  Read column values left-to-right as they appear; only the HEADER words are reversed, not the values.
• IGNORE the following boilerplate sections that appear in every inspection report — do NOT extract data from them:
  - סעיף 4 / הערות נוספות (section 4 / additional notes)
  - פקודת הבטיחות בעבודה legal disclaimer text (סעיפים 75,76,81,86...)
  - תסקיר זה מייצג / תסקיר זה אינו / יש לשמור boilerplate paragraphs
  - Inspector's personal details block (חתימת הבודק / פרטים מלאים of the inspector)
  - End-of-document instruction blocks, e.g. "יש לשמור תסקיר זה לביקורת מפקח העבודה", "תסקיר זה מייצג", "הערות"
  - Page footer / letterhead belonging to the INSPECTOR or the inspection company:
    this includes the inspector's own email, phone, company name, and address printed at the
    bottom of every page (e.g. "דואר אלקטרוני: ...", "נייד: ...", "M.A.D הנדסה ובטיחות").
    The CLIENT is the company or person whose equipment is being inspected — their details
    appear in the BODY of the report (e.g. "שם מעביד / בעל הציוד", "כתובת", "פרטי הלקוח"),
    NOT in the page footer. Never use footer email/phone as client contact details.
${inspectorExclusionNote}• IMPORTANT — company names with embedded numbers: Hebrew PDFs sometimes output
  company names in reversed visual order with digits attached without spaces, e.g.
  "מ\"הובלות בע1945שלב" which is actually "שלב 1945 הובלות בע\"מ".
  Another normal case is a numeric suffix in the company name, e.g. "מולטיפק פלסטיק 1990".
  When you see a company/client name that looks garbled (Hebrew words in wrong order,
  digits concatenated without spaces), reconstruct the correct name using context clues
  such as the email domain, address, or other mentions in the document.
${expiryNote}

JSON schema:
{
${fieldLines},${equipmentSection}
  "_confidence": "high" | "medium" | "low"   // your own confidence in the extraction
}`;
}

function buildInspectorExclusionNote(inspector?: InspectorProfile): string {
  if (!inspector) return "";
  const identifiers: string[] = [];
  if (inspector.company_name) identifiers.push(`company "${inspector.company_name}"`);
  if (inspector.company_email) identifiers.push(`email "${inspector.company_email}"`);
  if (inspector.company_phone) identifiers.push(`phone "${inspector.company_phone}"`);
  if (inspector.personal_name) identifiers.push(`personal name "${inspector.personal_name}"`);
  if (inspector.personal_phone) identifiers.push(`personal phone "${inspector.personal_phone}"`);
  if (inspector.personal_email) identifiers.push(`personal email "${inspector.personal_email}"`);
  if (inspector.personal_company_name) identifiers.push(`personal company "${inspector.personal_company_name}"`);
  if (!identifiers.length) return "";
  return `• INSPECTOR IDENTITY — The inspector/author of this report has the following details: ${identifiers.join(", ")}. ` +
    `These values belong to the inspector, NOT to the client. ` +
    `If any of these exact values appear in the document, do NOT assign them to client fields (client_email, client_phone, client_company, client_name).\n`;
}
