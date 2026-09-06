/** Section-based print template layout (simpler alternative to the Excel grid editor). */

export type PrintTemplateEditorType = "grid" | "sections";

export type PrintTemplateBorderWidth = "thin" | "medium" | "thick";

export type PrintTemplateFieldSize = "normal" | "small";

export type PrintTemplateTextSize = "small" | "normal" | "large";

export interface PrintTemplateSectionField {
    label: string;
    bind: string;
    bold?: boolean;
    size?: PrintTemplateFieldSize;
}

export interface PrintTemplateSectionStyles {
  borderColor: string;
  borderWidth: PrintTemplateBorderWidth;
}

export interface PrintTemplateSectionStyleOverride {
  noBorder?: boolean;
}

export interface PrintTemplateLayoutHeaderSection {
  type: "header";
  title: string;
  subtitle?: string;
  titleSize?: PrintTemplateTextSize;
  titleBold?: boolean;
  subtitleSize?: PrintTemplateTextSize;
  subtitleBold?: boolean;
  fields: PrintTemplateSectionField[];
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutFieldsSection {
  type: "fields";
  title: string;
  fields: PrintTemplateSectionField[];
  columns?: number;
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutEquipmentColumn {
    label: string;
    bind: string;
}

export interface PrintTemplateLayoutEquipmentSection {
  type: "equipment_table";
  title: string;
  columns: PrintTemplateLayoutEquipmentColumn[];
  style?: PrintTemplateSectionStyleOverride;
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
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutStaticSection {
  type: "static_text";
  title: string;
  text: string;
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutSignatureSection {
  type: "signature";
  enabled: boolean;
  imageSrc?: string;
  inspectorText?: string;
  companyName?: string;
    certificationText?: string;
    /** Horizontal alignment of the inspector label and signature. */
    align?: "right" | "center" | "left";
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutImageSection {
  type: "image";
  title?: string;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  align?: "right" | "center" | "left";
  style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutFooterSection {
    type: "footer";
    enabled: boolean;
    leftLabel?: string;
    leftBind?: string;
    centerLabel?: string;
    centerBind?: string;
    rightLabel?: string;
    rightBind?: string;
    style?: PrintTemplateSectionStyleOverride;
}

export type PrintTemplateSection =
  | PrintTemplateLayoutHeaderSection
  | PrintTemplateLayoutFieldsSection
  | PrintTemplateLayoutEquipmentSection
  | PrintTemplateLayoutFindingsSection
  | PrintTemplateLayoutStaticSection
  | PrintTemplateLayoutSignatureSection
    | PrintTemplateLayoutImageSection
    | PrintTemplateLayoutFooterSection;

export interface PrintTemplateLayout {
    styles: PrintTemplateSectionStyles;
    sections: PrintTemplateSection[];
}

export const DEFAULT_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "תיאור", bind: "description"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם", bind: "model"},
    {label: "מס׳ סידורי", bind: "serial_number"},
    {label: "רדיוס עומס (מטר)", bind: "load_radius"},
    {label: 'עומס מבחן (ק"ג)', bind: "load_capacity_test"},
    {label: 'עומס עבודה בטוח (ק"ג)', bind: "load_capacity_work"},
];

const ACCESSORY_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "תיאור האביזר", bind: "description"},
    {label: "כמות", bind: "quantity"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם/סוג", bind: "model"},
    {label: "מס׳ סידורי/זיהוי", bind: "serial_number"},
    {label: 'עומס עבודה בטוח (ק"ג)', bind: "load_capacity_work"},
    {label: "הערות", bind: "equipment_description"},
];

const PRESSURE_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "תיאור המתקן", bind: "description"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם", bind: "model"},
    {label: "מס׳ סידורי", bind: "serial_number"},
    {label: "מס׳ רישוי/זיהוי", bind: "license_number"},
    {label: "לחץ עבודה מותר", bind: "load_capacity_work"},
    {label: "לחץ בדיקה/ניסוי", bind: "load_capacity_test"},
];

// Matches Part 2 (תיאור הקולט) of a real inspector-issued air-receiver report,
// which describes the vessel in far more physical detail than the generic
// pressure-equipment columns above — this is scoped to air_receiver only for
// now; the other pressure types (steam_receiver, steam_boiler, pressure_vessel)
// still use PRESSURE_EQUIPMENT_COLUMNS until confirmed working here first.
const AIR_RECEIVER_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "מיקום", bind: "equipment_location"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם", bind: "model"},
    {label: "מס״ד פנימי", bind: "serial_number"},
    {label: "נפח (ליטר)", bind: "volume_liters"},
    {label: "קוטר (מ״מ)", bind: "diameter_mm"},
    {label: "חומר", bind: "material"},
    {label: "מבנה", bind: "construction_type"},
    {label: "עובי דופן (מ״מ)", bind: "wall_thickness_mm"},
    {label: "עובי כיפות (מ״מ)", bind: "cap_thickness_mm"},
    {label: "פתחי בקרה וניקוי", bind: "access_openings"},
    {label: "פקק", bind: "plug_present"},
    {label: "כווה", bind: "corrosion_present"},
    {label: "קוטר שסתום בטחון (מ״מ)", bind: "safety_valve_diameter_mm"},
];

const ELEVATOR_EQUIPMENT_COLUMNS: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "תיאור", bind: "description"},
    {label: "יצרן", bind: "manufacturer"},
    {label: "דגם", bind: "model"},
    {label: "מס׳ סידורי", bind: "serial_number"},
    {label: "מס׳ רישוי/זיהוי", bind: "license_number"},
    {label: "מקום ההתקנה", bind: "inspection_location"},
];

const COMMON_LEGAL_TEXT =
    "התסקיר מתייחס למצב הציוד ביום הבדיקה בלבד ואינו מחליף תחזוקה שוטפת, הוראות יצרן, תקנים מחייבים או הוראות כל דין. במקרה של ליקוי המסכן את המשתמשים אין להפעיל את הציוד עד לתיקון הליקוי ואישור מתאים.";

export interface InspectionPrintTemplatePreset {
    key: string;
    name: string;
    reportTypeLabel: string;
    contractType: string;
    category: string;
    intervalMonths: number;
    title: string;
    subtitle: string;
    equipmentTitle: string;
    equipmentFieldsTitle: string;
    equipmentColumns: PrintTemplateLayoutEquipmentColumn[];
    legalText: string;
}

export const INSPECTION_PRINT_TEMPLATE_PRESETS: InspectionPrintTemplatePreset[] = [
    {
        key: "lifting_machine",
        name: "תסקיר מכונות הרמה",
        reportTypeLabel: "תסקיר מכונות הרמה",
        contractType: "תסקיר בדיקה וניסוי מכונות הרמה",
        category: "lift",
        intervalMonths: 14,
        title: "תסקיר ניסוי ובדיקה של מכונת הרמה",
        subtitle: 'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל-1970 סעיפים 81 ו-86',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור מכונת הרמה",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS,
        legalText:
            "התסקיר נערך לבדיקת מכונת הרמה בהתאם לפקודת הבטיחות בעבודה (נוסח חדש), תש\"ל-1970, ובכלל זה סעיפים 81 ו-86. בדיקה תקופתית נדרשת לכל היותר אחת ל-14 חודשים, אלא אם נקבעה דרישה מחמירה יותר לפי דין, הוראות יצרן או החלטת הבודק. יש להפעיל את הציוד לפי עומסי העבודה המאושרים, טבלת העומסים, תנאי האתר והוראות היצרן. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "lifting_accessory",
        name: "תסקיר אביזרי הרמה",
        reportTypeLabel: "תסקיר אביזרי הרמה",
        contractType: "תסקיר בדיקה וניסוי אביזרי הרמה",
        category: "accessory",
        intervalMonths: 6,
        title: "תסקיר ניסוי ובדיקה של אביזרי הרמה",
        subtitle: 'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל-1970 סעיפים 75 ו-76',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור אביזרי הרמה",
        equipmentColumns: ACCESSORY_EQUIPMENT_COLUMNS,
        legalText:
            "התסקיר נערך לבדיקת אביזרי הרמה לפי פקודת הבטיחות בעבודה (נוסח חדש), תש\"ל-1970, סעיפים 75 ו-76. אביזרי הרמה יישאו זיהוי וסימון עומס עבודה בטוח, וייבדקו לפחות אחת ל-6 חודשים. אין להשתמש באביזר שחסר זיהוי/סימון, שפג תוקף בדיקתו או שנמצא בו ליקוי. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "elevator",
        name: "תסקיר מעלית",
        reportTypeLabel: "תסקיר מעלית",
        contractType: "תסקיר בדיקה תקופתית למעלית",
        category: "elevator",
        intervalMonths: 6,
        title: "תסקיר בדיקה תקופתית למעלית",
        subtitle: "בדיקה תקופתית על ידי בודק מוסמך למעליות",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור המעלית",
        equipmentColumns: ELEVATOR_EQUIPMENT_COLUMNS,
        legalText:
            "התסקיר נערך לבדיקת מעלית תקופתית על ידי בודק מוסמך. מעלית מחויבת בבדיקה תקופתית אחת ל-6 חודשים. אם נמצאו ליקויים העלולים לסכן משתמשים, יש להשבית את המעלית עד לתיקון הליקויים ולקבלת אישור מתאים. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "escalator",
        name: "תסקיר דרגנוע",
        reportTypeLabel: "תסקיר דרגנוע",
        contractType: "תסקיר בדיקה תקופתית לדרגנוע",
        category: "escalator",
        intervalMonths: 6,
        title: "תסקיר בדיקה תקופתית לדרגנוע",
        subtitle: "בדיקה תקופתית על ידי בודק מוסמך לדרגנועים",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור הדרגנוע",
        equipmentColumns: ELEVATOR_EQUIPMENT_COLUMNS,
        legalText:
            "התסקיר נערך לבדיקת דרגנוע או מסוע נוסעים על ידי בודק מוסמך בהתאם להסמכתו ולדרישות הדין. יש לבדוק מערכות עצירה, מדרגות, מעקות, מסרקים, שילוט והגנות, ולפעול לפי הוראות היצרן והוראות מינהל הבטיחות. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "tower_crane",
        name: "תסקיר עגורן צריח",
        reportTypeLabel: "תסקיר עגורן צריח באתר בנייה",
        contractType: "תסקיר בדיקה תקופתית לעגורן צריח",
        category: "tower_crane",
        intervalMonths: 6,
        title: "תסקיר בדיקה תקופתית לעגורן צריח",
        subtitle: 'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל-1970 והוראות בטיחות בעגורני צריח',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור עגורן הצריח",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS,
        legalText:
            "עגורן צריח באתר בנייה נדרש בבדיקה תקופתית אחת ל-6 חודשים. יש לוודא התאמה להוראות היצרן, טבלת עומסים, מצב השירות, עיגונים/יסודות, מערכות חשמל, בלמים ותנאי מזג אוויר. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "work_platform",
        name: "תסקיר במת הרמה",
        reportTypeLabel: "תסקיר במת הרמה באתר בנייה",
        contractType: "תסקיר בדיקה תקופתית לבמת הרמה",
        category: "work_platform",
        intervalMonths: 6,
        title: "תסקיר בדיקה תקופתית לבמת הרמה",
        subtitle: "בדיקת מתקן הרמה באתר בנייה על ידי בודק מוסמך",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור במת ההרמה",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS,
        legalText:
            "במת הרמה באתר בנייה נדרשת בבדיקה תקופתית אחת ל-6 חודשים. אין להפעיל את הבמה במקרה של ליקוי בטיחותי, חריגה מעומס, חסר במעקות/מייצבים או אי התאמה להוראות היצרן. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "powered_scaffold",
        name: "תסקיר פיגום ממוכן",
        reportTypeLabel: "תסקיר פיגום ממוכן",
        contractType: "תסקיר בדיקה תקופתית לפיגום ממוכן",
        category: "powered_scaffold",
        intervalMonths: 6,
        title: "תסקיר בדיקה תקופתית לפיגום ממוכן",
        subtitle: "בדיקת פיגום ממוכן על ידי בודק מוסמך",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור הפיגום הממוכן",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS,
        legalText:
            "פיגום ממוכן נדרש בבדיקה תקופתית אחת ל-6 חודשים. יש לבדוק עיגון, מנגנוני הרמה, בלמים, גידור, משטחי עבודה ומערכות בטיחות לפי הוראות היצרן והדין. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "air_receiver",
        name: "תסקיר קולט אוויר",
        reportTypeLabel: "תסקיר קולט אוויר / קומפרסור",
        contractType: "תסקיר בדיקה לקולט אוויר",
        category: "air_receiver",
        intervalMonths: 26,
        title: "תסקיר בדיקה לקולט אוויר",
        // Real inspector-issued air-receiver reports header with the safety
        // ordinance sections (115,116) that authorize the inspection itself, not
        // just the pressure-equipment regulations that govern how it's carried
        // out — both citations appear on the actual document.
        subtitle: 'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל 1970- סעיפים 115,116',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור קולט האוויר",
        equipmentColumns: AIR_RECEIVER_EQUIPMENT_COLUMNS,
        legalText:
            "קולט אוויר/קומפרסור הוא מיתקן לחץ לפי תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ\"ז-1967, ונבדק מכוח סעיפים 115,116 לפקודת הבטיחות בעבודה (נוסח חדש), תש\"ל-1970. התסקיר לקולט אוויר נערך לפי תקנה 5 והתוספת הרביעית. יש לציין לחץ עבודה מותר, ניסויים/בדיקות שנעשו, מצב האבזרים ושסתומי הבטיחות. התסקיר יימסר לתופש המקום והעתק למפקח עבודה אזורי בתוך 21 ימים. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "steam_receiver",
        name: "תסקיר קולט קיטור",
        reportTypeLabel: "תסקיר קולט קיטור",
        contractType: "תסקיר בדיקה לקולט קיטור",
        category: "steam_receiver",
        intervalMonths: 26,
        title: "תסקיר בדיקה לקולט קיטור",
        subtitle: 'תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ"ז-1967',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור קולט הקיטור",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS,
        legalText:
            "קולט קיטור הוא מיתקן לחץ לפי תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ\"ז-1967. התסקיר לקולט קיטור נערך לפי תקנה 5 והתוספת הרביעית. יש לציין לחץ עבודה מותר, ניסויים/בדיקות שנעשו, מצב האבזרים ושסתומי הבטיחות. התסקיר יימסר לתופש המקום והעתק למפקח עבודה אזורי בתוך 21 ימים. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "steam_boiler",
        name: "תסקיר דוד קיטור",
        reportTypeLabel: "תסקיר דוד קיטור",
        contractType: "תסקיר בדיקה לדוד קיטור",
        category: "steam_boiler",
        intervalMonths: 14,
        title: "תסקיר בדיקה לדוד קיטור",
        subtitle: 'תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ"ז-1967',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור דוד הקיטור",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS,
        legalText:
            "דוד קיטור הוא מיתקן לחץ. תקנה 4 מבחינה בין תסקיר בדיקה כשהדוד קר לבין בדיקה בלחץ קיטור רגיל. יש לציין לחץ עבודה מותר, טיב הניסויים, שסתומי בטיחות ותנאי הפעלה שנקבעו בתסקיר. התסקיר יימסר לתופש המקום והעתק למפקח עבודה אזורי בתוך 21 ימים. " + COMMON_LEGAL_TEXT,
    },
    {
        key: "pressure_vessel",
        name: "תסקיר כלי לחץ",
        reportTypeLabel: "תסקיר כלי לחץ",
        contractType: "תסקיר בדיקה לכלי לחץ",
        category: "pressure_vessel",
        intervalMonths: 26,
        title: "תסקיר בדיקה למיתקן לחץ",
        subtitle: 'תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ"ז-1967',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור מיתקן הלחץ",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS,
        legalText:
            "התסקיר נערך למיתקן לחץ לפי תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ\"ז-1967. יש לציין את פרטי המתקן, לחץ העבודה המותר, הניסויים והבדיקות שבוצעו, תוצאות הבדיקה והוראות הפעלה או תיקון. התסקיר יימסר לתופש המקום והעתק למפקח עבודה אזורי בתוך 21 ימים. " + COMMON_LEGAL_TEXT,
    },
];

export const DEFAULT_SIGNATURE_CERTIFICATION =
    "אני: {{engineer_name}} בעל תעודה מס': {{inspector_number}}\n" +
    'שהוסמכתי ע"י מפקח עבודה ראשי על פי סימן ז\' לפרק ג\' לפקודת הבטיחות בעבודה (נוסח חדש) תש"ל 1970,\n' +
    "לעשות ניסויים ובדיקות, מאשר כי בדקתי את הציוד המתואר בתסקיר לעיל בהתאם לתקנות\n" +
    "פרטים מלאים: {{engineer_address}} טלפון: {{engineer_phone}}";

export function createDefaultPrintTemplateLayout(): PrintTemplateLayout {
    return createInspectionPrintTemplateLayout("lifting_machine");
}

export function getInspectionPrintTemplatePreset(key: string): InspectionPrintTemplatePreset {
    return INSPECTION_PRINT_TEMPLATE_PRESETS.find((preset) => preset.key === key)
        ?? INSPECTION_PRINT_TEMPLATE_PRESETS[0];
}

// The 4 pressure-equipment types report on ONE vessel with many physical
// attributes (location, volume, diameter, material, wall thickness, ...),
// which the real inspector-issued forms lay out as a vertical label:value
// list — not a table with attributes as columns and equipment items as rows,
// which is the right shape for lifting_machine/elevator/etc. reports that can
// have several equipment items per report.
const PRESSURE_TYPE_KEYS = new Set(["air_receiver", "steam_receiver", "steam_boiler", "pressure_vessel"]);

export function createInspectionPrintTemplateLayout(keyOrPreset: string | InspectionPrintTemplatePreset): PrintTemplateLayout {
    const preset = typeof keyOrPreset === "string" ? getInspectionPrintTemplatePreset(keyOrPreset) : keyOrPreset;
    const isPressureType = PRESSURE_TYPE_KEYS.has(preset.key);
    return {
        styles: {borderColor: "#111111", borderWidth: "thin"},
        sections: [
            {
                type: "header",
                title: preset.title,
                subtitle: preset.subtitle,
                fields: [
                    {bind: "document_number", label: "מספר תסקיר בדיקה"},
                    {bind: "prev_report_number", label: "מספר תסקיר קודם"},
                    {bind: "start_date", label: "תאריך בדיקה"},
                    {bind: "expiry_date", label: "בתוקף עד"},
                ],
            },
            isPressureType ? {
                // Matches a real inspector-issued report's Part 1: label:value
                // rows, laid out 2 per row (side by side) rather than the
                // 3-column grid every other report type uses.
                type: "fields" as const,
                title: "1. פרטי הלקוח/תופש",
                columns: 2,
                fields: [
                    {bind: "client_company", label: "פרטי הלקוח/תופש"},
                    {bind: "client_address", label: "כתובת"},
                    {bind: "client_name", label: "איש קשר"},
                    {bind: "client_phone", label: "טלפון"},
                    {bind: "client_mobile", label: "נייד"},
                ],
            } : {
                type: "fields" as const,
                title: "1. פרטי הלקוח/תופש",
                columns: 3,
                fields: [
                    {bind: "client_company", label: "שם הלקוח/תופש"},
                    {bind: "client_address", label: "כתובת"},
                    {bind: "client_city", label: "יישוב"},
                    {bind: "zip_code", label: "מיקוד"},
                    {bind: "client_name", label: "איש קשר"},
                    {bind: "client_phone", label: "טלפון"},
                    {bind: "client_mobile", label: "נייד"},
                    {bind: "client_fax", label: "פקס"},
                    {bind: "client_email", label: "מייל"},
                    {bind: "inspection_type", label: "סוג בדיקה"},
                    {bind: "license_number", label: "מספר רישוי"},
                    {bind: "inspection_location", label: "מקום הבדיקה"},
                ],
            },
            ...(isPressureType ? [{
                // Replaces the equipment_table for this group: a pressure
                // vessel's attributes rendered as vertical rows (the same
                // label/bind pairs preset.equipmentColumns already carries),
                // matching the real form instead of a wide multi-column table.
                type: "fields" as const,
                title: preset.equipmentFieldsTitle,
                columns: 2,
                fields: preset.equipmentColumns.map((c) => ({label: c.label, bind: c.bind})),
            }] : [
                {
                    type: "fields" as const,
                    title: preset.equipmentFieldsTitle,
                    columns: 2,
                    fields: [
                        {bind: "name", label: "שם הציוד"},
                        {bind: "inspection_location", label: "מקום הבדיקה"},
                    ],
                },
                {
                    type: "equipment_table" as const,
                    title: preset.equipmentTitle,
                    columns: preset.equipmentColumns.map((c) => ({...c})),
                },
            ]),
            // Parts 3, 4 and 6 of a real inspector-issued pressure-equipment report
            // cover the last hydraulic test, the test results (including the
            // safety-valve opening pressure), and the permitted working pressure
            // given the test outcome — regulatory content shared by all 4
            // pressure-vessel types (air_receiver, steam_receiver, steam_boiler,
            // pressure_vessel) under the pressure-vessel testing regulations. The
            // findings/notes section numbering below shifts to match (5/7 instead
            // of 3/4) for this group.
            ...(isPressureType ? [
                {
                    type: "fields" as const,
                    title: "3. פרטי ניסוי הידראולי אחרון",
                    columns: 3,
                    fields: [
                        {bind: "last_test_performed_by", label: 'בוצע ע"י'},
                        {bind: "last_test_date", label: "בתאריך"},
                        {bind: "last_test_pressure_bar", label: "לחץ מבחן (בר)"},
                    ],
                },
                {
                    type: "fields" as const,
                    title: "4. תוצאות הבדיקה",
                    columns: 2,
                    fields: [
                        {bind: "inspection_type", label: "סוג בדיקה"},
                        {bind: "source_pressure_limit_bar", label: "הגבלת לחץ במקור האספקה (בר)"},
                        {bind: "receiver_condition", label: "מצב הקולט"},
                        {bind: "accessories_condition", label: "מצב האביזרים"},
                        {bind: "safety_valve_opening_pressure_bar", label: "לחץ פתיחה שסתום בטחון (בר)"},
                    ],
                },
            ] : []),
            {
                type: "findings",
                title: isPressureType
                    ? "5. תיאור ליקויים, השיפורים, ואמצעים לתיקונים"
                    : "3. תיאור ליקויים, השיפורים, ואמצעים לתיקונים",
                rows: [
                    {number: "1", subjectLabel: "כללי:", bind: "findings_general"},
                    {number: "2", subjectLabel: "ליקוי:", bind: "findings_remedy"},
                ],
                deadlineLabel: "תוך",
                deadlineBind: "findings_deadline",
                deadlineSuffix: "ימים — אסור לעבוד עם הפרק עד להסדרת הליקוי",
            },
            ...(isPressureType ? [{
                type: "fields" as const,
                title: "6. לחץ עבודה מותר בהתחשב בתנאי העבודה ותוצאות הבדיקה",
                columns: 1,
                fields: [
                    {bind: "permitted_working_pressure_bar", label: "לחץ עבודה מותר (בר)"},
                ],
            }] : []),
            {
                type: "static_text",
                title: isPressureType ? "הערות נוספות" : "4. הערות נוספות",
                text: preset.legalText,
            },
            {type: "signature", enabled: true, align: "left"},
            createDefaultFooterSection(),
        ],
    };
}

export function createInspectionPrintTemplateSeeds(now: string = new Date().toISOString()) {
    return INSPECTION_PRINT_TEMPLATE_PRESETS.map((preset) => ({
        user_id: null,
        name: preset.name,
        page: "A4" as const,
        dir: "rtl" as const,
        cols: [],
        rows: [],
        cells: [],
        hasFixedFrame: false,
        editorType: "sections" as const,
        layout: createInspectionPrintTemplateLayout(preset),
        is_shared: true,
        system_key: `inspection:${preset.key}`,
        reportTypeKey: preset.key,
        reportTypeLabel: preset.reportTypeLabel,
        contractType: preset.contractType,
        category: preset.category,
        inspectionIntervalMonths: preset.intervalMonths,
        created_at: now,
        updated_at: now,
    }));
}

export function createDefaultFooterSection(): PrintTemplateLayoutFooterSection {
    return {
        type: "footer",
        enabled: true,
        leftLabel: "מספר בודק:",
        leftBind: "inspector_number",
        centerLabel: "",
        centerBind: "company_name",
        rightLabel: "ח.פ:",
        rightBind: "company_registration",
    };
}
