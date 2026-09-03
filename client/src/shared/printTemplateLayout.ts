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

/** Per-section style overrides */
export interface PrintTemplateSectionStyleOverride {
    /** Hide border for this section */
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
    /** Number of columns for field grid (default 3) */
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
    /** Signature/stamp image URL or base64 data URI */
    imageSrc?: string;
    /** Inspector details text (name, license, phone, etc.) */
    inspectorText?: string;
    /** Company name */
    companyName?: string;
    /** Certification paragraph above the signature. Empty string hides it. */
    certificationText?: string;
    /** Horizontal alignment of the inspector label and signature. */
    align?: "right" | "center" | "left";
    style?: PrintTemplateSectionStyleOverride;
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
    style?: PrintTemplateSectionStyleOverride;
}

export interface PrintTemplateLayoutFooterSection {
    type: "footer";
    enabled: boolean;
    /** Left column (e.g., email) */
    leftLabel?: string;
    leftBind?: string;
    /** Center column (e.g., company name) */
    centerLabel?: string;
    centerBind?: string;
    /** Right column (e.g., phone) */
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

export const LAYOUT_FIELD_PRESETS: PrintTemplateSectionField[] = [
    {bind: "document_number", label: "מספר תסקיר"},
    {bind: "prev_report_number", label: "מספר תסקיר קודם"},
    {bind: "start_date", label: "תאריך בדיקה"},
    {bind: "expiry_date", label: "בתוקף עד"},
    {bind: "client_company", label: "שם הלקוח/תופש"},
    {bind: "client_name", label: "איש קשר"},
    {bind: "client_phone", label: "טלפון"},
    {bind: "client_email", label: "מייל"},
    {bind: "client_address", label: "כתובת"},
    {bind: "client_city", label: "יישוב"},
    {bind: "zip_code", label: "מיקוד"},
    {bind: "client_mobile", label: "נייד"},
    {bind: "client_fax", label: "פקס"},
    {bind: "license_number", label: "מספר רישוי"},
    {bind: "inspection_type", label: "סוג בדיקה"},
    {bind: "inspection_location", label: "מקום הבדיקה"},
    {bind: "description", label: "תיאור ציוד"},
    {bind: "chassis", label: "שלדה"},
    {bind: "findings_general", label: "כללי"},
    {bind: "findings_remedy", label: "ליקוי"},
    {bind: "findings_deadline", label: "תוך (ימים)"},
    {bind: "engineer_name", label: "שם הבודק"},
    {bind: "engineer_phone", label: "טלפון בודק"},
    {bind: "engineer_email", label: "מייל בודק"},
    {bind: "engineer_company", label: "חברת הבודק"},
    {bind: "inspector_number", label: "מספר בודק"},
    {bind: "company_name", label: "שם חברה"},
    {bind: "company_registration", label: "ח.פ / רישיון"},
    {bind: "engineer_address", label: "כתובת בודק"},
];

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
        subtitle: 'תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ"ז-1967',
        equipmentTitle: "",
        equipmentFieldsTitle: "2. תיאור קולט האוויר",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS,
        legalText:
            "קולט אוויר/קומפרסור הוא מיתקן לחץ לפי תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ\"ז-1967. התסקיר לקולט אוויר נערך לפי תקנה 5 והתוספת הרביעית. יש לציין לחץ עבודה מותר, ניסויים/בדיקות שנעשו, מצב האבזרים ושסתומי הבטיחות. התסקיר יימסר לתופש המקום והעתק למפקח עבודה אזורי בתוך 21 ימים. " + COMMON_LEGAL_TEXT,
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

export function signatureCertificationText(section: { certificationText?: string }): string | null {
    if (section.certificationText === "") return null;
    return section.certificationText ?? DEFAULT_SIGNATURE_CERTIFICATION;
}

export function fillLayoutPlaceholders(template: string, data: Record<string, string | undefined>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? "");
}

export function createDefaultPrintTemplateLayout(): PrintTemplateLayout {
    return createInspectionPrintTemplateLayout("lifting_machine");
}

export function getInspectionPrintTemplatePreset(key: string): InspectionPrintTemplatePreset {
    return INSPECTION_PRINT_TEMPLATE_PRESETS.find((preset) => preset.key === key)
        ?? INSPECTION_PRINT_TEMPLATE_PRESETS[0];
}

export function createInspectionPrintTemplateLayout(keyOrPreset: string | InspectionPrintTemplatePreset): PrintTemplateLayout {
    const preset = typeof keyOrPreset === "string" ? getInspectionPrintTemplatePreset(keyOrPreset) : keyOrPreset;
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
            {
                type: "fields",
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
            {
                type: "fields",
                title: preset.equipmentFieldsTitle,
                columns: 2,
                fields: [
                    {bind: "name", label: "שם הציוד"},
                    {bind: "inspection_location", label: "מקום הבדיקה"},
                ],
            },
            {
                type: "equipment_table",
                title: preset.equipmentTitle,
                columns: preset.equipmentColumns.map((c) => ({...c})),
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

export function clonePrintTemplateLayout(layout: PrintTemplateLayout): PrintTemplateLayout {
    return JSON.parse(JSON.stringify(layout)) as PrintTemplateLayout;
}

export function joinStackedValues(values: Array<string | number | null | undefined> | null | undefined): string {
    return (values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean).join("\n");
}

export function splitStackedCellValue(value: string | null | undefined): string[] {
    const parts = String(value ?? "").split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts : [""];
}

export function equipmentTableRowCount(
    columns: {bind: string}[],
    data: Record<string, unknown> | undefined,
): number {
    let max = 1;
    if (!data) return max;
    for (const key of Object.keys(data)) {
        for (const col of columns) {
            const prefix = `${col.bind}_`;
            if (!key.startsWith(prefix)) continue;
            const n = Number(key.slice(prefix.length));
            if (Number.isInteger(n) && n >= 2 && n <= 50) max = Math.max(max, n);
        }
    }
    return max;
}

export function equipmentTableCellKey(bind: string, rowIndex: number): string {
    return rowIndex === 0 ? bind : `${bind}_${rowIndex + 1}`;
}

/** Collect unique field binds from a layout (for compose forms). */
export function extractLayoutFieldBinds(layout: PrintTemplateLayout): PrintTemplateSectionField[] {
    const seen = new Set<string>();
    const out: PrintTemplateSectionField[] = [];
    function add(label: string, bind: string) {
        if (!bind || seen.has(bind)) return;
        seen.add(bind);
        out.push({ label, bind });
    }
    for (const section of layout.sections) {
        if (section.type === "header" || section.type === "fields") {
            for (const f of section.fields) add(f.label, f.bind);
        } else if (section.type === "equipment_table") {
            for (const c of section.columns) add(c.label, c.bind);
        } else if (section.type === "findings") {
            for (const r of section.rows) add(r.subjectLabel.replace(/:$/, ""), r.bind);
            if (section.deadlineBind) add(section.deadlineLabel ?? "תוך", section.deadlineBind);
        } else if (section.type === "footer") {
            if (section.leftBind) add(section.leftLabel || section.leftBind, section.leftBind);
            if (section.centerBind) add(section.centerLabel || section.centerBind, section.centerBind);
            if (section.rightBind) add(section.rightLabel || section.rightBind, section.rightBind);
        }
    }
    return out;
}

export const LAYOUT_BORDER_COLORS = [
    { label: "שחור", value: "#111111" },
    { label: "כחול", value: "#1d4ed8" },
    { label: "ירוק", value: "#15803d" },
    { label: "סגול", value: "#7c3aed" },
    { label: "כתום", value: "#c2410c" },
];
