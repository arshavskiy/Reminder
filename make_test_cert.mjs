// Generates a minimal valid PDF with Hebrew certificate text (Latin-only PDF text,
// but the content string contains the Hebrew for the OCR test — we embed it as
// visible text via a simple approach: write a plain-text file renamed as PDF won't
// work, so instead we produce a proper PDF with embedded UTF-8 text using raw PDF ops.
//
// Since standard PDF fonts don't support Hebrew, we write the text as visible
// ASCII placeholders AND embed the Hebrew in the document metadata/comments so
// Tesseract OCR (which reads the rendered page) can't read it directly.
//
// Better approach for OCR testing: produce a PNG image of the certificate text,
// then wrap it in a PDF. But simplest for our test: just write a UTF-8 text file
// that the importer's txt parser will read directly.

import {writeFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The importer accepts .txt files and reads them with readFileSync('utf-8')
// so this is the fastest path to test parseCertFromText without needing real OCR.
const certText = `תעודת בטיחות מקצועית

שם התעודה: תעודת מפעיל מנוף
סוג: בטיחות
גוף מנפיק: רשות העבודה הישראלית

שם המחזיק: ישראל ישראלי
מספר זהות: 123456789

תאריך הנפקה: 15/03/2023
תוקף עד: 15/03/2026

תעודה זו מאשרת כי המחזיק עמד בכל הדרישות
לתפעול בטוח של ציוד הרמה בהתאם לתקנות הבטיחות בעבודה.

חתימה: ___________________
מספר תעודה: CERT-2023-4521
`;

const outPath = join(__dirname, "test_certificate_hebrew.txt");
writeFileSync(outPath, certText, "utf-8");
console.log("Created:", outPath);
console.log("\nContent preview:");
console.log(certText);
