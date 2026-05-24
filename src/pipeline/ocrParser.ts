import { createWorker } from "tesseract.js";
import { getSettings } from "../settings";

export async function ocrFile(filePath: string): Promise<string> {
  const settings = getSettings();
  const lang = settings.ocrLanguage; // e.g. "heb+eng"

  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(filePath);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
