import {createWorker} from "tesseract.js";
import {getEffectiveSettings} from "../effectiveSettings.js";
import {fixHebrewBidi} from "./hebrewBidi";

const OCR_TIMEOUT_MS = 120_000;

export async function ocrFile(filePath: string): Promise<string> {
  const settings = await getEffectiveSettings();
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

    const result = await Promise.race([
      worker.recognize(filePath),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timed out after 120s")), OCR_TIMEOUT_MS)
      ),
    ]);

    let text = result.data.text ?? "";
    text = fixHebrewBidi(text);
    return text;
  } finally {
    worker.terminate().catch(() => {});
  }
}
