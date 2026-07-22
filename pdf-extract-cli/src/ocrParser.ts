import {createWorker} from "tesseract.js";
import {fixHebrewBidi} from "./hebrewBidi.js";
import {stripGarbage} from "./pdfParser.js";
import type {Config} from "./config.js";

const OCR_TIMEOUT_MS = 120_000;

export async function ocrFile(filePath: string, config: Config): Promise<string> {
  const lang = config.ocrLanguage; // e.g. "heb+eng"

  // tesseract.js's internal message handler rejects the current job's
  // promise on an engine-level failure (e.g. "Error attempting to read
  // image" on a corrupt/encrypted/unsupported file) but THEN unconditionally
  // re-throws that same error synchronously inside its worker message
  // callback — UNLESS an `errorHandler` option is supplied, in which case it
  // calls that instead of throwing. Without this, the throw becomes an
  // uncaught exception that kills the whole process, bypassing any
  // try/catch here entirely (recognize()'s own rejection is irrelevant —
  // the process dies before anything can await it).
  let workerErrorMessage: string | null = null;
  const worker = await createWorker(lang, undefined, {
    errorHandler: (err: unknown) => {
      workerErrorMessage = err instanceof Error ? err.message : String(err);
    },
  });

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
    text = stripGarbage(text);
    text = fixHebrewBidi(text);
    return text;
  } catch (err) {
    // recognize() rejects with the raw error payload rather than an Error
    // instance in some tesseract.js failure paths — prefer the message
    // captured by errorHandler when available, since it's consistently a
    // clean string ("Error attempting to read image.").
    if (workerErrorMessage) throw new Error(workerErrorMessage);
    throw err;
  } finally {
    worker.terminate().catch(() => {});
  }
}
