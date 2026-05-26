import { createWorker } from "tesseract.js";
import { getSettings } from "../settings";
import { fixHebrewBidi } from "./hebrewBidi";

export async function ocrFile(filePath: string): Promise<string> {
  const settings = getSettings();
  const lang = settings.ocrLanguage; // e.g. "heb+eng"

  const worker = await createWorker(lang);
  try {
    // PSM 6 = uniform block of text (best for structured documents / forms)
    // preserve_interword_spaces keeps column spacing intact so Hebrew+Latin
    // table cells don't get merged into garbled runs
    await worker.setParameters({
      tessedit_pageseg_mode: "6" as any,
      preserve_interword_spaces: "1" as any,
    });

    const { data } = await worker.recognize(filePath);
    let text = data.text ?? "";

    // Apply Hebrew bidi fix — OCR output for RTL documents often has the same
    // visual-order issues as pdf-parse output
    text = fixHebrewBidi(text);

    return text;
  } finally {
    await worker.terminate();
  }
}
