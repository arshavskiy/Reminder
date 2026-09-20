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
    /** Prefills the first column (e.g. Main Hoist / Whip) so the table matches the source form. */
    fixedRows?: string[];
    /** Minimum printed rows when the inspector has not added extra lines. */
    minRows?: number;
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

export interface PrintTemplateLayoutChecklistItem {
    number: string;
    label: string;
    /** Regulation/code citation, e.g. "O- 1926.1412(f)(2)(ii)" — omitted when the source form has none. */
    reference?: string;
    bind: string;
}

export interface PrintTemplateLayoutChecklistGroup {
    /** Sub-heading above this group's items. Empty string for an ungrouped/flat checklist. */
    title: string;
    items: PrintTemplateLayoutChecklistItem[];
}

export interface PrintTemplateLayoutChecklistSection {
    type: "checklist";
    title: string;
    /** e.g. "A= Acceptable, OK   X= Safety Hazard   M= Monitor   R= Recommended   N= Not Applicable" */
    codeLegend?: string;
    /** Items laid out in N columns per row (default 2). */
    columns?: number;
    /** WA L&I uses Acceptable/N-A boxes; Loadking/ANSI uses a single letter code. */
    markStyle?: "code" | "acceptable_na";
    groups: PrintTemplateLayoutChecklistGroup[];
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
  | PrintTemplateLayoutChecklistSection
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
    /**
     * When set, the seed/layout functions use this pre-built layout verbatim
     * instead of running it through createInspectionPrintTemplateLayout(En) —
     * for presets whose source document (e.g. a multi-section annual crane
     * certification form with a grouped checklist) doesn't fit the generic
     * header/fields/equipment_table/findings shape every other preset shares.
     */
    customLayout?: PrintTemplateLayout;
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

// English (US) equipment-column sets, mirroring the Hebrew ones above with
// the same binds (so extraction/backend field mapping is unchanged) but
// labels matching US inspection-report wording (OSHA/ASME/ANSI/API).
const DEFAULT_EQUIPMENT_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Description", bind: "description"},
    {label: "Manufacturer", bind: "manufacturer"},
    {label: "Model", bind: "model"},
    {label: "Serial Number", bind: "serial_number"},
    {label: "Load Radius (m)", bind: "load_radius"},
    {label: "Test Load (kg)", bind: "load_capacity_test"},
    {label: "Rated/Safe Working Load (kg)", bind: "load_capacity_work"},
];

const ACCESSORY_EQUIPMENT_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Item Description", bind: "description"},
    {label: "Quantity", bind: "quantity"},
    {label: "Manufacturer", bind: "manufacturer"},
    {label: "Model/Type", bind: "model"},
    {label: "Serial/ID Number", bind: "serial_number"},
    {label: "Rated/Safe Working Load (kg)", bind: "load_capacity_work"},
    {label: "Remarks", bind: "equipment_description"},
];

const PRESSURE_EQUIPMENT_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Equipment Description", bind: "description"},
    {label: "Manufacturer", bind: "manufacturer"},
    {label: "Model", bind: "model"},
    {label: "Serial Number", bind: "serial_number"},
    {label: "License/ID Number", bind: "license_number"},
    {label: "Permitted Working Pressure", bind: "load_capacity_work"},
    {label: "Test Pressure", bind: "load_capacity_test"},
];

const AIR_RECEIVER_EQUIPMENT_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Location", bind: "equipment_location"},
    {label: "Manufacturer", bind: "manufacturer"},
    {label: "Model", bind: "model"},
    {label: "Internal Serial No.", bind: "serial_number"},
    {label: "Volume (L)", bind: "volume_liters"},
    {label: "Diameter (mm)", bind: "diameter_mm"},
    {label: "Material", bind: "material"},
    {label: "Construction Type", bind: "construction_type"},
    {label: "Wall Thickness (mm)", bind: "wall_thickness_mm"},
    {label: "Head Thickness (mm)", bind: "cap_thickness_mm"},
    {label: "Access/Cleaning Openings", bind: "access_openings"},
    {label: "Plug Present", bind: "plug_present"},
    {label: "Corrosion Present", bind: "corrosion_present"},
    {label: "Safety Valve Diameter (mm)", bind: "safety_valve_diameter_mm"},
];

const ELEVATOR_EQUIPMENT_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Description", bind: "description"},
    {label: "Manufacturer", bind: "manufacturer"},
    {label: "Model", bind: "model"},
    {label: "Serial Number", bind: "serial_number"},
    {label: "License/ID Number", bind: "license_number"},
    {label: "Installation Location", bind: "inspection_location"},
];

const COMMON_LEGAL_TEXT_EN =
    "This report reflects the condition of the equipment on the date of inspection only and does not replace routine maintenance, manufacturer instructions, applicable codes, or legal requirements. If a defect is found that endangers users, the equipment must not be operated until the defect is corrected and re-certified.";

// Modeled on WA L&I form F416-043-000 "Construction Mobile Crane Worksheet /
// Annual Certificate of Operation" — a flat 51-item acceptable/N-A checklist
// (no category groups, no per-item regulation citation) plus a wire-rope
// table and a proof-load-test table, both shaped closer to the source form
// than the generic equipment_table/findings sections other presets use.
const CRANE_ANNUAL_WA_CHECKLIST_ITEMS: PrintTemplateLayoutChecklistItem[] = [
    {number: "1", label: "Crane maintenance records of critical components", bind: "checklist_1"},
    {number: "2", label: "Shift inspections for the past 3 months/last annual", bind: "checklist_2"},
    {number: "3", label: "Order of immediate restraint currently issued", bind: "checklist_3"},
    {number: "4", label: "Crane level indicator", bind: "checklist_4"},
    {number: "5", label: "Boom stops", bind: "checklist_5"},
    {number: "6", label: "Jib stops", bind: "checklist_6"},
    {number: "7", label: "Foot pedal brakes have locks", bind: "checklist_7"},
    {number: "8", label: "Outrigger jacks & stabilizer jacks holding valve", bind: "checklist_8"},
    {number: "9", label: "Horn", bind: "checklist_9"},
    {number: "10", label: "Boom hoist limiting device", bind: "checklist_10"},
    {number: "11", label: "Luffing jib limiting device", bind: "checklist_11"},
    {number: "12", label: "Anti two-blocking device", bind: "checklist_12"},
    {number: "13", label: "Boom angle or radius indicator", bind: "checklist_13"},
    {number: "14", label: "Jib angle indicator if crane has a luffing jib", bind: "checklist_14"},
    {number: "15", label: "Boom length indicator", bind: "checklist_15"},
    {number: "16", label: "Load weighing and similar devices", bind: "checklist_16"},
    {number: "17", label: "Outrigger/stabilizer position sensor/monitor", bind: "checklist_17"},
    {number: "18", label: "Hoist drum rotation indicator if drum not visible", bind: "checklist_18"},
    {number: "19", label: "Configuration of crane", bind: "checklist_19"},
    {number: "20", label: "Sheave grooves free from surface defects", bind: "checklist_20"},
    {number: "21", label: "Sheave guards in place", bind: "checklist_21"},
    {number: "22", label: "Rigging gear used for load test inspected by a qualified person", bind: "checklist_22"},
    {number: "23", label: "All control and drive mechanisms", bind: "checklist_23"},
    {number: "24", label: "Air, hydraulic, and other pressurized lines", bind: "checklist_24"},
    {number: "25", label: "Hydraulic system for proper fluid level", bind: "checklist_25"},
    {number: "26", label: "Safety latches on hooks", bind: "checklist_26"},
    {number: "27", label: "Hooks for deformation, cracks, wear or damage", bind: "checklist_27"},
    {number: "28", label: "Legible and applicable operator's manual", bind: "checklist_28"},
    {number: "29", label: "Fire extinguisher with minimum 10 BC rating", bind: "checklist_29"},
    {number: "30", label: "Crane cleanliness and housekeeping", bind: "checklist_30"},
    {number: "31", label: "Rope reeving in compliance with manufacturer", bind: "checklist_31"},
    {number: "32", label: "Electrical apparatus/equipment", bind: "checklist_32"},
    {number: "33", label: "Tires properly inflated and condition", bind: "checklist_33"},
    {number: "34", label: "Crane level", bind: "checklist_34"},
    {number: "35", label: "Operator cab windows free of cracks and damage", bind: "checklist_35"},
    {number: "36", label: "Rails, rail stops, rails clamps", bind: "checklist_36"},
    {number: "37", label: "Equipment structure condition", bind: "checklist_37"},
    {number: "38", label: "Crane boom condition", bind: "checklist_38"},
    {number: "39", label: "Crane jib boom condition", bind: "checklist_39"},
    {number: "40", label: "Pins, bearings, shafts, gears, rollers, locking devices", bind: "checklist_40"},
    {number: "41", label: "Brake and clutch system parts", bind: "checklist_41"},
    {number: "42", label: "Gas, diesel, or other power plants for safe condition", bind: "checklist_42"},
    {number: "43", label: "Chains and drive sprockets", bind: "checklist_43"},
    {number: "44", label: "Travel steering, brakes, and locking devices", bind: "checklist_44"},
    {number: "45", label: "Hydraulic and pneumatic pumps and motors", bind: "checklist_45"},
    {number: "46", label: "Hydraulic and pneumatic cylinders", bind: "checklist_46"},
    {number: "47", label: "Outrigger pads and slider pads for wear or cracks", bind: "checklist_47"},
    {number: "48", label: "Electrical components and wiring", bind: "checklist_48"},
    {number: "49", label: "Legible warning labels and decals as required", bind: "checklist_49"},
    {number: "50", label: "Operator seat", bind: "checklist_50"},
    {number: "51", label: "Steps, ladders, handrails, and guards", bind: "checklist_51"},
];

const CRANE_WIRE_ROPE_ROWS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Rope Application", bind: "rope_application"},
    {label: "# of Parts", bind: "rope_parts"},
    {label: "Diameter", bind: "rope_diameter"},
    {label: "No. Strands", bind: "rope_strands"},
    {label: "Wires per Strand", bind: "rope_wires_per_strand"},
    {label: "Rotation Resistant", bind: "rope_rotation_resistant"},
    {label: "Breaking Strength", bind: "rope_breaking_strength"},
    {label: "Acceptable", bind: "rope_acceptable"},
];

function buildCraneAnnualWaLayout(): PrintTemplateLayout {
    return {
        styles: {borderColor: "#111111", borderWidth: "thin"},
        sections: [
            {
                type: "header",
                title: "Construction Mobile Crane Worksheet / Annual Certificate of Operation",
                subtitle: "A completed copy must be accessible from the operator's cab or with the operator's manual, and emailed within 5 days to LniCranes@Lni.wa.gov.",
                fields: [
                    {bind: "document_number", label: "Crane Sticker Number"},
                    {bind: "start_date", label: "Date of Inspection"},
                    {bind: "expiry_date", label: "Inspection Due Date"},
                    {bind: "inspector_number", label: "Certifier Number"},
                ],
            },
            {
                type: "fields",
                title: "Owner / Crane Information",
                columns: 3,
                fields: [
                    {bind: "client_company", label: "Owner Name"},
                    {bind: "client_address", label: "Owner Mailing Address"},
                    {bind: "client_city", label: "City"},
                    {bind: "zip_code", label: "State / Zip Code"},
                    {bind: "client_email", label: "Owner Email Address"},
                    {bind: "engineer_name", label: "Certifier Name"},
                    {bind: "manufacturer", label: "Crane Manufacturer"},
                    {bind: "model", label: "Crane Model Number"},
                    {bind: "serial_number", label: "Crane Serial Number"},
                    {bind: "load_capacity_work", label: "Maximum Rated Capacity (lbs)"},
                    {bind: "boom_length_max", label: "Maximum Boom Length"},
                    {bind: "jib_length_max", label: "Maximum Jib Length"},
                    {bind: "hour_meter_reading", label: "Hour Meter Reading"},
                    {bind: "crane_type", label: "Crane Type (Lattice/Hydraulic/Articulating/Other)"},
                    {bind: "crane_tested_on_rubber", label: "Crane Tested on Rubber (Yes/No)"},
                ],
            },
            {
                type: "equipment_table",
                title: "Wire Rope Inspection (Main Hoist, Whip, 3rd Hoist, Boom, Boom Pendants)",
                columns: CRANE_WIRE_ROPE_ROWS_EN,
                fixedRows: ["Main Hoist", "Whip", "3rd Hoist", "Boom", "Boom Pendants"],
            },
            {
                type: "fields",
                title: "Proof Load Test",
                columns: 1,
                fields: [
                    {bind: "load_test_method", label: "Load Test Conducted Using (freely suspended certified weights / scaled weights with a current calibration certificate)"},
                ],
            },
            {
                type: "equipment_table",
                title: "Proof Load Test Configuration (as configured at the time of load test — WAC 296-155-53202 / 53204)",
                columns: [
                    {label: "Hoist Line", bind: "load_line"},
                    {label: "Boom Length (ft)", bind: "load_boom_length"},
                    {label: "Jib Length (ft)", bind: "load_jib_length"},
                    {label: "Radius (ft)", bind: "load_radius"},
                    {label: "CWT (lbs)", bind: "load_cwt"},
                    {label: "Gross Capacity (lbs)", bind: "load_gross_capacity"},
                    {label: "Deductions (lbs)", bind: "load_deductions"},
                    {label: "Net Capacity (lbs)", bind: "load_net_capacity"},
                    {label: "Test Load (lbs)", bind: "load_capacity_test"},
                    {label: "Load Test %", bind: "load_test_pct"},
                    {label: "Test Range", bind: "load_test_range"},
                ],
                minRows: 1,
            },
            {
                type: "checklist",
                title: "Inspection Checklist (Acceptable / N-A)",
                codeLegend: "Mark each item Acceptable or N/A. A safe test area must be selected and all traffic and unauthorized personnel/equipment cleared before load testing.",
                columns: 2,
                markStyle: "acceptable_na",
                groups: [
                    {title: "", items: CRANE_ANNUAL_WA_CHECKLIST_ITEMS},
                ],
            },
            {
                type: "findings",
                title: "Follow-Up / Additional Notes",
                rows: [
                    {number: "1", subjectLabel: "General:", bind: "findings_general"},
                    {number: "2", subjectLabel: "Defect:", bind: "findings_remedy"},
                ],
            },
            {
                type: "static_text",
                title: "Certification",
                text: "I hereby certify that the above inspection and tests have been conducted in accordance with the Washington State Safety Standards for Construction Operations (WAC 296-155 Part L). " + COMMON_LEGAL_TEXT_EN,
            },
            {type: "signature", enabled: true, align: "right"},
            createDefaultFooterSectionEn(),
        ],
    };
}

// Modeled on Loadking's "Annual ANSI Inspection - Boom Truck Cranes" form — a
// 127-item checklist grouped into named categories with OSHA 1926/ASME B30
// citations per item, plus wire-rope, no-load test, load-test, and a
// deficiency/follow-up log with two separate sign-offs.
function craneAnsiItem(number: string, reference: string, label: string): PrintTemplateLayoutChecklistItem {
    return {number, reference, label, bind: `checklist_${number}`};
}

const CRANE_ANSI_CHECKLIST_GROUPS: PrintTemplateLayoutChecklistGroup[] = [
    {
        title: "Documentation / Historical Records",
        items: [
            craneAnsiItem("1", "O- 1926.1412(f)(2)(ii)", "Monthly Inspection Records"),
            craneAnsiItem("2", "A- B30.5-2.3.1(a)", "Maintenance Records"),
            craneAnsiItem("3", "O- 1926.1434(a)", "Modification Records"),
            craneAnsiItem("4", "A- B30.5-2.2.2(a)(2)", "Load Test Records"),
        ],
    },
    {
        title: "General",
        items: [
            craneAnsiItem("5", "", "Inspect worksite area for potential hazards, power lines, etc."),
            craneAnsiItem("6", "O- 1926.1433(d)(8)", "Covers, Guards, Overall Condition"),
            craneAnsiItem("7", "O- 1926.601(b)(2)(i&ii)", "External Lighting"),
            craneAnsiItem("8", "A- B30.5-3.4.7", "General Housekeeping"),
            craneAnsiItem("9", "O- 1926.1422", "Hand Signal Chart"),
            craneAnsiItem("10", "O- 1926.1412(f)(2)(xvii)", "Warning Decals/ Placards"),
        ],
    },
    {
        title: "Truck / Carrier Cab",
        items: [
            craneAnsiItem("11", "A- B30.5-3.4.9(a)", "Fire Extinguisher"),
            craneAnsiItem("12", "O- 1926.601(b)(5)", "Glass"),
            craneAnsiItem("13", "O- 1926.601(b)(4)", "Mirrors"),
            craneAnsiItem("14", "O- 1926.601(b)(2)(i)&(ii)", "Windshield Wipers/ Washer"),
            craneAnsiItem("15", "O- 1926.601(b)(9)", "Seat Belts"),
            craneAnsiItem("16", "O- 1926.1412(f)(2)(xviii)&(xix)", "Seat"),
            craneAnsiItem("17", "A- B30.5-2.1.2", "Electrical Controls/ Switches"),
            craneAnsiItem("18", "A- B30.5-2.1.3(a)(6)", "Instruments/ Gauges"),
            craneAnsiItem("19", "A- B30.5-2.1.3", "Power Take Off Controls"),
            craneAnsiItem("20", "A- B30.5.2.1.3(a)(10)", "Steering"),
            craneAnsiItem("21", "O- 1926.601(b)(3)", "Horn"),
            craneAnsiItem("22", "A- B30.5-2.1.2(d)", "Air Pressure"),
            craneAnsiItem("23", "O- 1926.601(b)(1)", "Parking Brakes"),
            craneAnsiItem("24", "A- B30.5-1.6.3", "Accelerator/ Throttle"),
            craneAnsiItem("25", "O- 1926.601(b)(1)", "Brakes"),
            craneAnsiItem("26", "A- B30.5-1.6.4", "Clutch"),
            craneAnsiItem("27", "O- 1926.1433(d)(7)(i)", "Windshield Defroster"),
            craneAnsiItem("28", "O- PCSA #2 8.01", "Operator's Manuals"),
        ],
    },
    {
        title: "Truck / Carrier Engine – Power Plant",
        items: [
            craneAnsiItem("29", "O- 1926.1412(f)(2)(vi)", "Oil level, Operation/ Perf."),
            craneAnsiItem("30", "O- 1926.1433(d)(9)", "Exhaust system, guards, shields"),
            craneAnsiItem("31", "O- 1926.1433(d)(8)", "Covers, Guards– Moving Parts"),
            craneAnsiItem("32", "O- 1926.1433(d)(8)", "Belts and Hoses, Clamps"),
        ],
    },
    {
        title: "Chassis / Carrier",
        items: [
            craneAnsiItem("33", "O- 1926.1412(f)(2)(i)", "Main Frame and Crossmembers"),
            craneAnsiItem("34", "O- 1926.1412(f)(2)(ix)", "Tires, Wheels, Lug nuts"),
            craneAnsiItem("35", "O- 1926.1412(f)(2)(ix)", "Tire Air Pressure"),
            craneAnsiItem("36", "O- 1926.601(b)(14)", "Transmission/ Transfer Case"),
            craneAnsiItem("37", "O- 1926.601(b)(14)", "Drivelines/ U-Joints"),
            craneAnsiItem("38", "O- 1926.1433(d)(8)", "Guards and Covers"),
            craneAnsiItem("39", "O- 1926.1412(f)(2)(x)", "Hydraulic Plumbing, Fittings"),
            craneAnsiItem("40", "O- 1926.1412(d)(1)(iv)", "Hydraulic Fluid level"),
            craneAnsiItem("41", "O- 1926.1423(c)(3)(ii)", "Anti-Slip Surfaces"),
            craneAnsiItem("42", "O- 1926.601(b)(4)(i)", "Backup Alarm operation"),
        ],
    },
    {
        title: "Outriggers / Stabilizers",
        items: [
            craneAnsiItem("43", "O- 1926.1412(f)(2)(i)", "Boxes/ Sub-Frame/ Attachment"),
            craneAnsiItem("44", "O- 1926.1412(f)(2)(i)", "Beams/ Legs/ Supports"),
            craneAnsiItem("45", "O- 1926.1412(f)(2)(xiii)", "Cylinders"),
            craneAnsiItem("46", "O- 1926.1412(f)(2)(xii)", "Holding Valves/ Lock Valves"),
            craneAnsiItem("47", "O- 1926.1412(f)(2)(x)", "Hydraulic Plumbing, Fittings"),
            craneAnsiItem("48", "O- 1926.1412(f)(2)(xiv)", "Pads/ Floats/ Storage/ Mounts"),
            craneAnsiItem("49", "O- 1926.1412(f)(2)(xvii)", "Caution and Warning Decals"),
        ],
    },
    {
        title: "Operator's Control Station",
        items: [
            craneAnsiItem("50", "O- 1926.1433(d)(6)", "Fire Extinguisher"),
            craneAnsiItem("51", "O- 1926.1433(d)(7)(iii)", "Glass"),
            craneAnsiItem("52", "O- 1926.1433(d)(7)(ii)", "Door Restraint/ Locks"),
            craneAnsiItem("53", "O- 1926.1412(f)(2)(xxi)", "Hand Rails, Steps, Platform"),
            craneAnsiItem("54", "O- 1926.1423(c)(3)(ii)", "Anti-Slip Surfaces"),
            craneAnsiItem("55", "A- PCSA #4 6.1.10.1", "Control Identification"),
            craneAnsiItem("56", "O- 1926.1407(g)", "Electrocution Warning"),
            craneAnsiItem("57", "O- 1926.1412(d)(1)", "Controls– Force to movement"),
            craneAnsiItem("58", "A- B30.5-1.6.3(b)", "Accelerator/ Throttle"),
            craneAnsiItem("59", "O- 1926.1415(a)(7)", "Horn"),
            craneAnsiItem("60", "O- 1926.1412(f)(2)(xviii)&(xix)", "Seat"),
        ],
    },
    {
        title: "Load Chart",
        items: [
            craneAnsiItem("61", "O- 1926.1433(d)(1)", "Per Configuration"),
            craneAnsiItem("62", "O- 1910.180(c)(2)", "Legible"),
            craneAnsiItem("63", "O- 1910.180(c)(2)", "Durable"),
            craneAnsiItem("64", "O- 1910.180(c)(2)", "Secured"),
            craneAnsiItem("65", "O- 1926.1417(c)(1)", "Visible from Operator's Station"),
        ],
    },
    {
        title: "Safety Devices / Operational Aids",
        items: [
            craneAnsiItem("66", "O- 1926.1416(d)(3)(i)", "Anti-Two Block Device"),
            craneAnsiItem("67", "O- 1926.1416(e)(5)(i)", "Outrigger/ Stabilizer Pos. Sensor"),
            craneAnsiItem("68", "O- 1926.1415(a)(1)", "Crane Level Indicator"),
            craneAnsiItem("69", "O- 1926.1416(e)(1)", "Boom Angle Indicator"),
            craneAnsiItem("70", "O- 1926.1416(e)(3)", "Boom Length Indicator"),
            craneAnsiItem("71", "O- 1926.1416(e)(5)(ii)", "Winch Drum Rotation Indicator"),
            craneAnsiItem("72", "O- 1926.1416(e)(4)", "Overload Protection"),
        ],
    },
    {
        title: "Upper Structure",
        items: [
            craneAnsiItem("73", "O- 1926.1412(f)(2)(i)", "Mounting"),
            craneAnsiItem("74", "O- 1926.1412(f)(2)(i)", "Turret"),
            craneAnsiItem("75", "O- 1926.1412(f)(2)(iii)", "Turntable"),
            craneAnsiItem("76", "O- 1926.1407(g)", "Electrocution Warning Decal"),
            craneAnsiItem("77", "O- 1926.1412(f)(2)(xvi)", "Electrical Wiring"),
            craneAnsiItem("78", "O- 1926.1412(f)(2)(xi)", "Swing/ Rotation Gearbox"),
            craneAnsiItem("79", "O- 1926.1412(f)(2)(xi)", "Hydraulic Pumps/ Motors"),
            craneAnsiItem("80", "O- 1926.1412(f)(2)(x)", "Hydraulic Plumbing/ Fittings"),
            craneAnsiItem("81", "O- 1926.1412(f)(xi)(A)", "Hydraulic Pressure"),
            craneAnsiItem("82", "O- 1926.1412(f)(2)(xi)", "Hoist/ Winch Motor, Valves"),
            craneAnsiItem("83", "A- B30.5-1.1.2(f)", "Hoist/ Winch Spooling"),
            craneAnsiItem("84", "O- 1926.1413(a)(4)(i)(B)", "Hoist/ Winch min. 2 rope wraps"),
            craneAnsiItem("85", "O- 1926.1433(d)(13)", "Hoist/ Winch Brake"),
        ],
    },
    {
        title: "Main Boom",
        items: [
            craneAnsiItem("86", "O- 1926.1412(f)(2)(i)", "Structure"),
            craneAnsiItem("87", "O- 1926.1412(f)(2)(iii)", "Boom Hinge Pin/ Pivot Point"),
            craneAnsiItem("88", "O- 1926.1412(f)(2)(xiii)", "Lift Cylinder and Pins"),
            craneAnsiItem("89", "O- 1926.1412(f)(2)(xiii)", "Telescoping Cylinder/ Attach."),
            craneAnsiItem("90", "O- 1926.1412(f)(2)(x)", "Hydraulic Plumbing, Fittings"),
            craneAnsiItem("91", "O- 1926.1412(f)(2)(xii)", "Holding Valves/ Lock Valves"),
            craneAnsiItem("92", "O- 1926.1412(f)(2)(i)", "Boom Head Section"),
            craneAnsiItem("93", "O- 1926.1412(f)(2)(i)", "Boom Sections Alignment"),
            craneAnsiItem("94", "O- 1926.1412(f)(2)(xv)", "Wear Pads/ Shims/ Attachment"),
            craneAnsiItem("95", "O- 1926.1412(f)(2)(ii)", "Sheaves/ Rollers/ Retainers"),
            craneAnsiItem("96", "O- 1926.1413(a)(2)(i)(D)", "Wire Rope/ Cable Retainers"),
            craneAnsiItem("97", "O- 1926.1413(a)(2)(i)(D)", "Hoist/ Winch Line Dead End"),
            craneAnsiItem("98", "", "Other"),
        ],
    },
    {
        title: "Truck / Carrier Engine – Power Plant (Continued)",
        items: [
            craneAnsiItem("31b", "O- 1926.1433(d)(8)", "Covers, Guards– Moving Parts"),
        ],
    },
    {
        title: "Jib / Extensions",
        items: [
            craneAnsiItem("99", "O- 1926.1412(f)(2)(i)(A)", "Structure"),
            craneAnsiItem("100", "O- 1926.1413(a)(2)(i)(D)", "Wire Rope/ Cable Retainers"),
            craneAnsiItem("101", "O- 1926.1412(f)(2)(iii)", "Pins and Locking Devices"),
            craneAnsiItem("102", "O- 1926.1415(a)(3)", "Positive Stops"),
            craneAnsiItem("103", "O- 1926.1412(f)(2)(ii)", "Sheaves"),
        ],
    },
    {
        title: "Load Block / Multi-Sheave Block and Hook",
        items: [
            craneAnsiItem("104", "O- 1926.1433(d)(3)", "Capacity Marking"),
            craneAnsiItem("105", "O- 1926.1433(d)(3)", "Weight Marking"),
            craneAnsiItem("106", "O- 1926.1433(d)(4)", "Safety Latch(s)"),
            craneAnsiItem("107", "O- 1926.1412(f)(2)(iii)", "Bearings"),
            craneAnsiItem("108", "O- 1926.1412(f)(2)(ii)", "Sheaves"),
            craneAnsiItem("109", "O- 1926.1414(f)&(g)", "Wedge Socket/ End Fitting"),
            craneAnsiItem("110", "O- 1926.1412(d)(1)(vi)", "Reeving/ Retainers"),
            craneAnsiItem("111", "A- B30.10-1.10.5(f)", "0° Hook Bend or Twist"),
            craneAnsiItem("112", "A- B30.10-1.10.5(g)", "5% Hook Opening or 1/4\" Max."),
            craneAnsiItem("113", "A- B30.10-1.10.5(e)", "10% Hook Wear Max."),
            craneAnsiItem("114", "A- B30.5-2.1.3(i)", "NDT Results"),
            craneAnsiItem("115", "", "Other"),
        ],
    },
    {
        title: "Overhaul / Downhaul Ball and Hook",
        items: [
            craneAnsiItem("116", "O- 1926.1433(d)(3)", "Weight Marking"),
            craneAnsiItem("117", "O- 1926.1433(d)(4)", "Safety Latch(s)"),
            craneAnsiItem("118", "O- 1926.1412(f)(2)(iii)", "Swivel/ Bearing"),
            craneAnsiItem("119", "O- 1926.1414(f)&(g)", "Wedge Socket/ End Fitting"),
            craneAnsiItem("120", "A- B30.10-1.10.5(f)", "0° Hook Bend or Twist"),
            craneAnsiItem("121", "A- B30.10-1.10.5(g)", "5% Hook Opening or 1/4\" Max."),
            craneAnsiItem("122", "A- B30.10-1.10.5(e)", "10% Hook Wear Max."),
            craneAnsiItem("123", "A- B30.5-2.1.3(i)", "NDT Results"),
            craneAnsiItem("124", "", "Other"),
            craneAnsiItem("125", "", "Other"),
        ],
    },
];

const CRANE_ANSI_WIRE_ROPE_COLUMNS_EN: PrintTemplateLayoutEquipmentColumn[] = [
    {label: "Rope Application", bind: "rope_application"},
    {label: "Type", bind: "rope_type"},
    {label: "Size", bind: "rope_size"},
    {label: "Construction", bind: "rope_construction"},
    {label: "Grade", bind: "rope_grade"},
    {label: "Core", bind: "rope_core"},
    {label: "Measured Wear", bind: "rope_measured_wear"},
    {label: "Broken Wires", bind: "rope_broken_wires"},
    {label: "End Connections", bind: "rope_end_connections"},
    {label: "Lubricate", bind: "rope_lubricate"},
    {label: "Code", bind: "rope_code"},
];

function buildCraneAnnualAnsiLayout(): PrintTemplateLayout {
    return {
        styles: {borderColor: "#111111", borderWidth: "thin"},
        sections: [
            {
                type: "header",
                title: "Annual ANSI Inspection — Boom Truck Cranes",
                subtitle: "References: O = OSHA 1926 Subpart CC, 1926.601, 1910.180   A = ASME B30.5, B30.10",
                fields: [
                    {bind: "document_number", label: "Equip Number"},
                    {bind: "start_date", label: "Date"},
                    {bind: "expiry_date", label: "Next Inspection Due"},
                    {bind: "inspector_number", label: "R.O. Number"},
                ],
            },
            {
                type: "fields",
                title: "Equipment / Owner Information",
                columns: 3,
                fields: [
                    {bind: "client_company", label: "Company / Owner"},
                    {bind: "client_address", label: "Branch"},
                    {bind: "manufacturer", label: "Chassis Make-Model"},
                    {bind: "vin_number", label: "VIN"},
                    {bind: "hour_meter_reading", label: "Mileage / Hr Meter (ECM)"},
                    {bind: "model", label: "Unit Make-Model"},
                    {bind: "serial_number", label: "Serial Number"},
                ],
            },
            {
                type: "checklist",
                title: "Inspection Checklist",
                codeLegend: "Codes: A= Acceptable, OK   X= Safety Hazard   M= Monitor   R= Recommended   N= Not Applicable",
                columns: 2,
                markStyle: "code",
                groups: CRANE_ANSI_CHECKLIST_GROUPS,
            },
            {
                type: "equipment_table",
                title: "Wire Rope / Cable Inspection (OSHA 1926.1413)",
                columns: CRANE_ANSI_WIRE_ROPE_COLUMNS_EN,
                fixedRows: ["Primary Hoist", "Auxiliary Hoist", "Pendants", "Other"],
            },
            {
                type: "fields",
                title: "No Load Operational Test",
                columns: 1,
                fields: [
                    {bind: "no_load_test_result", label: "No Load Operational Test — A- B30.5-2.1.1"},
                ],
            },
            {
                type: "fields",
                title: "Load Test",
                columns: 3,
                fields: [
                    {bind: "load_boom_extension", label: "Boom Extension / Jib Length"},
                    {bind: "load_boom_angle", label: "Boom Angle"},
                    {bind: "load_radius", label: "Load Radius"},
                    {bind: "load_parts_of_line", label: "Parts of Line"},
                    {bind: "load_capacity_test", label: "Rated Capacity"},
                    {bind: "load_test_weight", label: "% of Rated Capacity Test Weight"},
                    {bind: "load_test_result", label: "Results (Passed / Failed / Not Applicable)"},
                ],
            },
            {
                type: "findings",
                title: "Follow-Up / Deficiency Details",
                deadlineLabel: "Note",
                deadlineBind: "findings_deadline",
                deadlineSuffix: "Any Safety Hazard must be corrected before the unit is returned to service.",
                rows: [
                    {number: "1", subjectLabel: "X/M/R:", bind: "findings_general"},
                    {number: "2", subjectLabel: "Corrective Action:", bind: "findings_remedy"},
                ],
            },
            {type: "signature", enabled: true, align: "right"},
            {
                type: "fields",
                title: "Confirmation of Inspection Receipt",
                columns: 2,
                fields: [
                    {bind: "owner_representative_name", label: "Name of Owner or Representative"},
                    {bind: "owner_representative_date", label: "Date"},
                ],
            },
            createDefaultFooterSectionEn(),
        ],
    };
}

export const INSPECTION_PRINT_TEMPLATE_PRESETS_EN: InspectionPrintTemplatePreset[] = [
    {
        key: "lifting_machine_en",
        name: "Lifting Machine Inspection Report",
        reportTypeLabel: "Lifting Machine Inspection Report",
        contractType: "Lifting Machine Test & Inspection Report",
        category: "lift",
        intervalMonths: 12,
        title: "Periodic Test and Inspection Report — Lifting Machine",
        subtitle: "OSHA 29 CFR 1910.179 / 1926.1412 — ASME B30 Series",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Lifting Machine Description",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "This report is issued for the inspection of a lifting machine under OSHA 29 CFR 1910.179 (overhead/gantry cranes) or 1926.1412 (construction cranes/derricks), and ASME B30 series requirements. A comprehensive periodic inspection is required at least annually, or more frequently per manufacturer instructions, severity of service, or inspector determination. Equipment must be operated within its rated load chart, site conditions, and manufacturer instructions. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "lifting_accessory_en",
        name: "Lifting Accessories Inspection Report",
        reportTypeLabel: "Lifting Accessories Inspection Report",
        contractType: "Lifting Accessories Test & Inspection Report",
        category: "accessory",
        intervalMonths: 12,
        title: "Test and Inspection Report — Rigging / Lifting Accessories",
        subtitle: "OSHA 29 CFR 1926.251 — Rigging Equipment for Material Handling",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Rigging Accessories Description",
        equipmentColumns: ACCESSORY_EQUIPMENT_COLUMNS_EN,
        legalText:
            "This report is issued for the inspection of rigging/lifting accessories (slings, chains, shackles, hooks) under OSHA 29 CFR 1926.251. Rigging equipment must carry legible rated-capacity identification and be inspected before each use and periodically by a competent person. Do not use any accessory missing identification, past its inspection interval, or found defective. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "elevator_en",
        name: "Elevator Inspection Report",
        reportTypeLabel: "Elevator Inspection Report",
        contractType: "Elevator Periodic Inspection Report",
        category: "elevator",
        intervalMonths: 12,
        title: "Periodic Inspection Report — Elevator",
        subtitle: "ASME A17.1 / State Elevator Code — Periodic Inspection by a Certified Inspector",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Elevator Description",
        equipmentColumns: ELEVATOR_EQUIPMENT_COLUMNS_EN,
        legalText:
            "This report is issued for the periodic inspection of an elevator by a certified/licensed elevator inspector under ASME A17.1 and applicable state elevator code. Elevators require periodic inspection and testing at intervals set by the state or local authority (commonly annual). If defects endangering users are found, the elevator must be taken out of service until repaired and re-certified. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "escalator_en",
        name: "Escalator Inspection Report",
        reportTypeLabel: "Escalator Inspection Report",
        contractType: "Escalator Periodic Inspection Report",
        category: "escalator",
        intervalMonths: 12,
        title: "Periodic Inspection Report — Escalator",
        subtitle: "ASME A17.1 / State Elevator Code — Periodic Inspection by a Certified Inspector",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Escalator Description",
        equipmentColumns: ELEVATOR_EQUIPMENT_COLUMNS_EN,
        legalText:
            "This report is issued for the periodic inspection of an escalator or moving walk by a certified inspector under ASME A17.1 and applicable state elevator code. Inspection covers braking systems, steps, handrails, comb plates, signage, and safety devices, per manufacturer instructions and the governing safety authority. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "tower_crane_en",
        name: "Tower Crane Inspection Report",
        reportTypeLabel: "Tower Crane Inspection Report (Construction Site)",
        contractType: "Tower Crane Periodic Inspection Report",
        category: "tower_crane",
        intervalMonths: 12,
        title: "Periodic Inspection Report — Tower Crane",
        subtitle: "OSHA 29 CFR 1926.1412 — ASME B30.3 Tower Cranes",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Tower Crane Description",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "A tower crane on a construction site requires a documented periodic inspection at intervals set by OSHA 29 CFR 1926.1412 and ASME B30.3. Inspection must confirm compliance with manufacturer instructions, load chart, foundation/anchoring, electrical systems, brakes, and weather-related operating limits. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "work_platform_en",
        name: "Aerial Work Platform Inspection Report",
        reportTypeLabel: "Aerial Work Platform Inspection Report (Construction Site)",
        contractType: "Aerial Work Platform Periodic Inspection Report",
        category: "work_platform",
        intervalMonths: 12,
        title: "Periodic Inspection Report — Aerial/Mobile Elevating Work Platform",
        subtitle: "ANSI A92 Series / OSHA 29 CFR 1926.453",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Work Platform Description",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "An aerial/mobile elevating work platform (MEWP) at a construction site requires a documented periodic inspection under ANSI A92 series requirements and OSHA 29 CFR 1926.453. The platform must not be operated if a safety defect exists, rated load is exceeded, guardrails/outriggers are missing, or the unit does not conform to manufacturer instructions. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "powered_scaffold_en",
        name: "Powered Scaffold Inspection Report",
        reportTypeLabel: "Powered/Suspended Scaffold Inspection Report",
        contractType: "Powered Scaffold Periodic Inspection Report",
        category: "powered_scaffold",
        intervalMonths: 12,
        title: "Periodic Inspection Report — Powered/Suspended Scaffold",
        subtitle: "OSHA 29 CFR 1926.451 — Scaffolds (General Requirements)",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Powered Scaffold Description",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "A powered/suspended scaffold requires a documented periodic inspection under OSHA 29 CFR 1926.451. Inspection must cover anchorage, hoisting mechanisms, brakes, guardrails, work surfaces, and safety systems per manufacturer instructions and applicable regulations. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "air_receiver_en",
        name: "Air Receiver Inspection Report",
        reportTypeLabel: "Air Receiver / Compressor Inspection Report",
        contractType: "Air Receiver Inspection Report",
        category: "air_receiver",
        intervalMonths: 24,
        title: "Inspection Report — Air Receiver",
        subtitle: "ASME BPVC Section VIII / OSHA 29 CFR 1910.169",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Air Receiver Description",
        equipmentColumns: AIR_RECEIVER_EQUIPMENT_COLUMNS_EN,
        legalText:
            "An air receiver/compressor is pressure equipment inspected under ASME BPVC Section VIII and OSHA 29 CFR 1910.169. This report must record the permitted working pressure, tests performed, condition of fittings, and safety valve status. The report is provided to the site operator and retained per the facility's compliance program. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "steam_receiver_en",
        name: "Steam Receiver Inspection Report",
        reportTypeLabel: "Steam Receiver Inspection Report",
        contractType: "Steam Receiver Inspection Report",
        category: "steam_receiver",
        intervalMonths: 24,
        title: "Inspection Report — Steam Receiver",
        subtitle: "ASME BPVC Section VIII — Pressure Vessels",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Steam Receiver Description",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS_EN,
        legalText:
            "A steam receiver is pressure equipment inspected under ASME BPVC Section VIII. This report must record the permitted working pressure, tests performed, condition of fittings, and safety valve status. The report is provided to the site operator and retained per the facility's compliance program. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "steam_boiler_en",
        name: "Steam Boiler Inspection Report",
        reportTypeLabel: "Steam Boiler Inspection Report",
        contractType: "Steam Boiler Inspection Report",
        category: "steam_boiler",
        intervalMonths: 12,
        title: "Inspection Report — Steam Boiler",
        subtitle: "ASME BPVC Section I — Power Boilers",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Steam Boiler Description",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS_EN,
        legalText:
            "A steam boiler is pressure equipment inspected under ASME BPVC Section I. This report distinguishes between a cold (out-of-service) inspection and an inspection under normal steam pressure, and must record permitted working pressure, test conditions, safety valve status, and operating conditions established by the inspection. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "pressure_vessel_en",
        name: "Pressure Vessel Inspection Report",
        reportTypeLabel: "Pressure Vessel Inspection Report",
        contractType: "Pressure Vessel Inspection Report",
        category: "pressure_vessel",
        intervalMonths: 24,
        title: "Inspection Report — Pressure Vessel",
        subtitle: "ASME BPVC Section VIII / API 510 — Pressure Vessel Inspection Code",
        equipmentTitle: "",
        equipmentFieldsTitle: "2. Pressure Vessel Description",
        equipmentColumns: PRESSURE_EQUIPMENT_COLUMNS_EN,
        legalText:
            "This report is issued for a pressure vessel under ASME BPVC Section VIII and API 510. It must record equipment details, permitted working pressure, tests and inspections performed, results, and any required corrective actions or operating restrictions. " + COMMON_LEGAL_TEXT_EN,
    },
    {
        key: "crane_annual_wa_en",
        name: "Construction Mobile Crane Annual Certificate",
        reportTypeLabel: "Construction Mobile Crane Worksheet / Annual Certificate of Operation",
        contractType: "Construction Mobile Crane Annual Certificate of Operation",
        category: "lift",
        intervalMonths: 12,
        title: "Construction Mobile Crane Worksheet / Annual Certificate of Operation",
        subtitle: "WAC 296-155 Part L — Proof load tests performed in accordance with WAC 296-155-53202 / 53204",
        equipmentTitle: "",
        equipmentFieldsTitle: "",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "A completed copy of this worksheet/annual certificate of operation must be accessible from the operator's cab or with the operator's manual. " + COMMON_LEGAL_TEXT_EN,
        customLayout: buildCraneAnnualWaLayout(),
    },
    {
        key: "crane_annual_ansi_en",
        name: "Annual ANSI Inspection — Boom Truck Crane",
        reportTypeLabel: "Annual ANSI Inspection Report — Boom Truck Cranes",
        contractType: "Annual ANSI Boom Truck Crane Inspection Report",
        category: "lift",
        intervalMonths: 12,
        title: "Annual ANSI Inspection — Boom Truck Cranes",
        subtitle: "OSHA 29 CFR 1926 Subpart CC, 1926.601, 1910.180 — ASME B30.5, B30.10",
        equipmentTitle: "",
        equipmentFieldsTitle: "",
        equipmentColumns: DEFAULT_EQUIPMENT_COLUMNS_EN,
        legalText:
            "OSHA and ASME allow only qualified persons who have completed training to inspect cranes. Consult operator or service manuals or bulletins as necessary for additional inspection requirements. " + COMMON_LEGAL_TEXT_EN,
        customLayout: buildCraneAnnualAnsiLayout(),
    },
];

export const DEFAULT_SIGNATURE_CERTIFICATION =
    "אני: {{engineer_name}} בעל תעודה מס': {{inspector_number}}\n" +
    'שהוסמכתי ע"י מפקח עבודה ראשי על פי סימן ז\' לפרק ג\' לפקודת הבטיחות בעבודה (נוסח חדש) תש"ל 1970,\n' +
    "לעשות ניסויים ובדיקות, מאשר כי בדקתי את הציוד המתואר בתסקיר לעיל בהתאם לתקנות\n" +
    "פרטים מלאים: {{engineer_address}} טלפון: {{engineer_phone}}";

export const DEFAULT_SIGNATURE_CERTIFICATION_EN =
    "I, {{engineer_name}}, credential No. {{inspector_number}},\n" +
    "a qualified person (and QEI where required by the Authority Having Jurisdiction),\n" +
    "certify that I inspected the equipment described in this report in accordance with the applicable OSHA / ASME / NBIC requirements as adopted by the AHJ.\n" +
    "Contact: {{engineer_address}}  Phone: {{engineer_phone}}";

export function signatureCertificationText(
    section: { certificationText?: string },
    dir: "rtl" | "ltr" = "rtl",
): string | null {
    if (section.certificationText === "") return null;
    const custom = section.certificationText;
    if (custom && !/פקודת הבטיחות|מפקח עבודה ראשי/.test(custom)) return custom;
    return dir === "ltr" ? DEFAULT_SIGNATURE_CERTIFICATION_EN : DEFAULT_SIGNATURE_CERTIFICATION;
}

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
const PRESSURE_TYPE_KEYS = new Set([
    "air_receiver", "steam_receiver", "steam_boiler", "pressure_vessel",
    "air_receiver_en", "steam_receiver_en", "steam_boiler_en", "pressure_vessel_en",
]);

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

export function createInspectionPrintTemplateLayoutEn(keyOrPreset: string | InspectionPrintTemplatePreset): PrintTemplateLayout {
    const preset = typeof keyOrPreset === "string"
        ? (INSPECTION_PRINT_TEMPLATE_PRESETS_EN.find((p) => p.key === keyOrPreset) ?? INSPECTION_PRINT_TEMPLATE_PRESETS_EN[0])
        : keyOrPreset;
    if (preset.customLayout) return preset.customLayout;
    const isPressureType = PRESSURE_TYPE_KEYS.has(preset.key);
    return {
        styles: {borderColor: "#111111", borderWidth: "thin"},
        sections: [
            {
                type: "header",
                title: preset.title,
                subtitle: preset.subtitle,
                fields: [
                    {bind: "document_number", label: "Report Number"},
                    {bind: "prev_report_number", label: "Previous Report Number"},
                    {bind: "start_date", label: "Inspection Date"},
                    {bind: "expiry_date", label: "Valid Until"},
                ],
            },
            isPressureType ? {
                type: "fields" as const,
                title: "1. Client / Occupier Details",
                columns: 2,
                fields: [
                    {bind: "client_company", label: "Client / Occupier"},
                    {bind: "client_address", label: "Address"},
                    {bind: "client_name", label: "Contact Person"},
                    {bind: "client_phone", label: "Phone"},
                    {bind: "client_mobile", label: "Mobile"},
                ],
            } : {
                type: "fields" as const,
                title: "1. Client / Occupier Details",
                columns: 3,
                fields: [
                    {bind: "client_company", label: "Client / Occupier Name"},
                    {bind: "client_address", label: "Address"},
                    {bind: "client_city", label: "City"},
                    {bind: "zip_code", label: "ZIP Code"},
                    {bind: "client_name", label: "Contact Person"},
                    {bind: "client_phone", label: "Phone"},
                    {bind: "client_mobile", label: "Mobile"},
                    {bind: "client_fax", label: "Fax"},
                    {bind: "client_email", label: "Email"},
                    {bind: "inspection_type", label: "Inspection Type"},
                    {bind: "license_number", label: "License Number"},
                    {bind: "inspection_location", label: "Inspection Location"},
                ],
            },
            ...(isPressureType ? [{
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
                        {bind: "name", label: "Equipment Name"},
                        {bind: "inspection_location", label: "Inspection Location"},
                    ],
                },
                {
                    type: "equipment_table" as const,
                    title: preset.equipmentTitle,
                    columns: preset.equipmentColumns.map((c) => ({...c})),
                },
            ]),
            ...(isPressureType ? [
                {
                    type: "fields" as const,
                    title: "3. Last Hydrostatic Test Details",
                    columns: 3,
                    fields: [
                        {bind: "last_test_performed_by", label: "Performed By"},
                        {bind: "last_test_date", label: "Date"},
                        {bind: "last_test_pressure_bar", label: "Test Pressure (bar)"},
                    ],
                },
                {
                    type: "fields" as const,
                    title: "4. Test Results",
                    columns: 2,
                    fields: [
                        {bind: "inspection_type", label: "Inspection Type"},
                        {bind: "source_pressure_limit_bar", label: "Supply Source Pressure Limit (bar)"},
                        {bind: "receiver_condition", label: "Receiver Condition"},
                        {bind: "accessories_condition", label: "Fittings Condition"},
                        {bind: "safety_valve_opening_pressure_bar", label: "Safety Valve Opening Pressure (bar)"},
                    ],
                },
            ] : []),
            {
                type: "findings",
                title: isPressureType
                    ? "5. Defects, Improvements, and Corrective Actions"
                    : "3. Defects, Improvements, and Corrective Actions",
                rows: [
                    {number: "1", subjectLabel: "General:", bind: "findings_general"},
                    {number: "2", subjectLabel: "Defect:", bind: "findings_remedy"},
                ],
                deadlineLabel: "Within",
                deadlineBind: "findings_deadline",
                deadlineSuffix: "days — the equipment must not be operated until the defect is corrected",
            },
            ...(isPressureType ? [{
                type: "fields" as const,
                title: "6. Permitted Working Pressure Given Test Results and Operating Conditions",
                columns: 1,
                fields: [
                    {bind: "permitted_working_pressure_bar", label: "Permitted Working Pressure (bar)"},
                ],
            }] : []),
            {
                type: "static_text",
                title: isPressureType ? "Additional Notes" : "4. Additional Notes",
                text: preset.legalText,
            },
            {type: "signature", enabled: true, align: "left", certificationText: DEFAULT_SIGNATURE_CERTIFICATION_EN},
            createDefaultFooterSectionEn(),
        ],
    };
}

export function createDefaultFooterSectionEn(): PrintTemplateLayoutFooterSection {
    return {
        type: "footer",
        enabled: true,
        leftLabel: "Inspector No.:",
        leftBind: "inspector_number",
        centerLabel: "",
        centerBind: "company_name",
        rightLabel: "Reg. No.:",
        rightBind: "company_registration",
    };
}

export function createInspectionPrintTemplateSeeds(now: string = new Date().toISOString()) {
    const heSeeds = INSPECTION_PRINT_TEMPLATE_PRESETS.map((preset) => ({
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
    const enSeeds = INSPECTION_PRINT_TEMPLATE_PRESETS_EN.map((preset) => ({
        user_id: null,
        name: preset.name,
        page: "A4" as const,
        dir: "ltr" as const,
        cols: [],
        rows: [],
        cells: [],
        hasFixedFrame: false,
        editorType: "sections" as const,
        layout: createInspectionPrintTemplateLayoutEn(preset),
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
    return [...heSeeds, ...enSeeds];
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
