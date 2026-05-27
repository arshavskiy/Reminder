import type {DocTemplate, TemplateField} from "../../src/shared/types.js";

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
export function buildPromptForTemplate(tpl: DocTemplate): string {
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
  const equipmentSection = isInspectionTemplate
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
      "name": string,                   // תיאור — full description text of the equipment item
      "manufacturer": string | null,    // יצרן
      "model": string | null,           // דגם (keep Latin model codes as-is, e.g. "SLR-CLU")
      "serial_number": string | null,   // מספר סידורי — ONE serial per object; keep mixed Hebrew+Latin as-is
      "load_capacity_work": string[],   // עומס עבודה בטוח — one entry per load configuration, include units e.g. ["3200 ק\"ג"]. Empty array if not present.
      "load_capacity_test": string[],   // עומס מבחן — one entry per load configuration. Empty array if not present.
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

  return `You are a document intelligence assistant specializing in Hebrew business documents.
The user has defined a template called "${tpl.name}". Extract structured information
from the provided document text and return ONLY ONE valid JSON object whose keys
match the schema below EXACTLY.

GENERAL RULES:
• All dates must be normalized to ISO 8601 (YYYY-MM-DD). Hebrew calendar → convert to Gregorian. Israeli DD/MM/YYYY → YYYY-MM-DD.
• Phone numbers: keep original Israeli format (e.g. "050-1234567"). If the number appears as 10 consecutive digits with no dash (e.g. "0537285690"), insert the dash after the 3rd digit → "053-7285690".
• Email addresses: Hebrew PDFs sometimes output email addresses in reversed visual order, e.g. "il.co1945.shelev@klodin" which is actually "klodin@shelev1945.co.il". Recognize a reversed email by checking whether the part after "@" looks like a name/word and the part before "@" looks like a domain (contains dots and a TLD like .co.il / .com / .org). If reversed, swap the two parts around "@".
• Address fields: keep each piece separate — client_address = street + city only (e.g. "הקידמה 235, אשדוד"), po_box = P.O. Box number only (e.g. "679"), client_zipcode = postal code only (5–7 digits labeled "מיקוד"). Do NOT mix ת.ד into client_address or client_zipcode.
• If a field cannot be determined, use null (or [] for list types).
• Do not invent data. Do not add fields not in the schema.
• The text may have residual bidi/encoding artifacts from PDF extraction — use context.
• IGNORE the following boilerplate sections that appear in every inspection report — do NOT extract data from them:
  - סעיף 4 / הערות נוספות (section 4 / additional notes)
  - פקודת הבטיחות בעבודה legal disclaimer text (סעיפים 75,76,81,86...)
  - תסקיר זה מייצג / תסקיר זה אינו / יש לשמור boilerplate paragraphs
  - Inspector's personal details block (חתימת הבודק / פרטים מלאים of the inspector)
• IMPORTANT — company names with embedded numbers: Hebrew PDFs sometimes output
  company names in reversed visual order with digits attached without spaces, e.g.
  "מ\"הובלות בע1945שלב" which is actually "שלב 1945 הובלות בע\"מ".
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
