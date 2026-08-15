/** Section-based print template layout (simpler alternative to the Excel grid editor). */

export type PrintTemplateEditorType = "grid" | "sections";

export type PrintTemplateBorderWidth = "thin" | "medium" | "thick";

export interface PrintTemplateSectionField {
    label: string;
    bind: string;
}

export interface PrintTemplateSectionStyles {
    borderColor: string;
    borderWidth: PrintTemplateBorderWidth;
}

export interface PrintTemplateLayoutHeaderSection {
    type: "header";
    title: string;
    subtitle?: string;
    fields: PrintTemplateSectionField[];
}

export interface PrintTemplateLayoutFieldsSection {
    type: "fields";
    title: string;
    fields: PrintTemplateSectionField[];
}

export interface PrintTemplateLayoutEquipmentColumn {
    label: string;
    bind: string;
}

export interface PrintTemplateLayoutEquipmentSection {
    type: "equipment_table";
    title: string;
    columns: PrintTemplateLayoutEquipmentColumn[];
}

export interface PrintTemplateLayoutFindingRow {
    number: string;
    subjectLabel: string;
    bind: string;
}

export interface PrintTemplateLayoutFindingsSection {
    type: "findings";
    title: string;
    rows: PrintTemplateLayoutFindingRow[];
    deadlineLabel?: string;
    deadlineBind?: string;
    deadlineSuffix?: string;
}

export interface PrintTemplateLayoutStaticSection {
    type: "static_text";
    title: string;
    text: string;
}

export interface PrintTemplateLayoutSignatureSection {
  type: "signature";
  enabled: boolean;
  /** Signature/stamp image URL or base64 data URI */
  imageSrc?: string;
  /** Inspector details text (name, license, phone, etc.) */
  inspectorText?: string;
  /** Company name */
  companyName?: string;
}

export interface PrintTemplateLayoutImageSection {
  type: "image";
  title?: string;
  /** Image URL or base64 data URI */
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  align?: "right" | "center" | "left";
}

export type PrintTemplateSection =
  | PrintTemplateLayoutHeaderSection
  | PrintTemplateLayoutFieldsSection
  | PrintTemplateLayoutEquipmentSection
  | PrintTemplateLayoutFindingsSection
  | PrintTemplateLayoutStaticSection
  | PrintTemplateLayoutSignatureSection
  | PrintTemplateLayoutImageSection;

export interface PrintTemplateLayout {
    styles: PrintTemplateSectionStyles;
    sections: PrintTemplateSection[];
}

export const DEFAULT_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "תיאור", bind: "name"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם", bind: "model"},
    {label: "מס׳ סידורי", bind: "serial_number"},
    {label: "רדיוס עומס (מטר)", bind: "load_radius"},
    {label: 'עומס מבחן (ק"ג)', bind: "load_capacity_test"},
    {label: 'עומס עבודה בטוח (ק"ג)', bind: "load_capacity_work"},
];

const SECTION4_STATIC_TEXT =
    'אישור זה מותנה בתנאי שמבצעים שימוש ותחזוקה במכונת הרמה על פי חוקים ותקנות, תקנים רשמיים והוראות יצרן, תסקיר זה מייצג מצב מכונת הרמה ביום הבדיקה. שימוש בציוד אסור במידה ואירע בו ליקוי או פג תוקפו של תסקיר זה. תסקיר זה אינו מהווה תעודת אחריות או ביטוח. יש לעבוד לפי טבלת העומסים של המנוף. לעבודה על קרקע יציבה בלבד. חובה לפתוח מייצבים מקסימאלי בכל עבודה. הפעלת המנוף מותרת למנופאי מוסמך בלבד.';

export function createDefaultPrintTemplateLayout(): PrintTemplateLayout {
    return {
        styles: {borderColor: "#111111", borderWidth: "thin"},
        sections: [
            {
                type: "header",
                title: "תסקיר ניסוי ובדיקה של מכונות הרמה ואביזריהן",
                subtitle: 'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל-1970 סעיפים 75,76,81,86',
                fields: [
                    {bind: "document_number", label: "מספר תסקיר בדיקה"},
                    {bind: "prev_report_number", label: "מספר תסקיר קודם"},
                    {bind: "start_date", label: "תאריך בדיקה"},
                    {bind: "expiry_date", label: "בתוקף עד"},
                ],
            },
            {
                type: "fields",
                title: "1. פרטי הלקוח/תופש",
                fields: [
                    {bind: "client_name", label: "איש קשר"},
                    {bind: "client_company", label: "שם הלקוח"},
                    {bind: "inspection_type", label: "סוג בדיקה"},
                    {bind: "client_phone", label: "טלפון"},
                    {bind: "client_email", label: "מייל"},
                    {bind: "zip_code", label: "מיקוד"},
                    {bind: "client_address", label: "יישוב"},
                    {bind: "license_number", label: "מספר רישוי"},
                    {bind: "chassis", label: "שלדה"},
                ],
            },
            {
                type: "equipment_table",
                title: "2. תיאור מכונת הרמה",
                columns: DEFAULT_EQUIPMENT_COLUMNS.map((c) => ({...c})),
            },
            {
                type: "findings",
                title: "3. תיאור ליקויים, השיפורים, ואמצעים לתיקונים",
                rows: [
                    {number: "1", subjectLabel: "כללי:", bind: "findings_general"},
                    {number: "2", subjectLabel: "ליקוי:", bind: "findings_remedy"},
                ],
                deadlineLabel: "תוך",
                deadlineBind: "findings_deadline",
                deadlineSuffix: "ימים — אסור לעבוד עם הפרק עד להסדרת הליקוי",
            },
            {
                type: "static_text",
                title: "4. הערות נוספות",
                text: SECTION4_STATIC_TEXT,
            },
            {type: "signature", enabled: true},
        ],
    };
}
