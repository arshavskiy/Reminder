import mammoth from "mammoth";
import {createWorker} from "tesseract.js";
import {mkdirSync, rmSync, writeFileSync} from "fs";
import {join} from "path";
import {tmpdir} from "os";
import {getSettings} from "../settings";

export interface DocxResult {
  text: string;
  needsOcr: boolean;
}

export async function parseDocx(filePath: string): Promise<DocxResult> {
  const images: { buffer: Buffer; ext: string }[] = [];

  // extractRawText doesn't type convertImage but it works at runtime for image capture
  const opts: any = {
    path: filePath,
    convertImage: mammoth.images.imgElement(async (image: any) => {
      const buf = Buffer.from(await image.read("base64"), "base64");
      const ext = (image.contentType as string | undefined)?.split("/")[1] ?? "png";
      images.push({ buffer: buf, ext });
      return { src: "" };
    }),
  };
  const result = await mammoth.extractRawText(opts);

  const text = result.value ?? "";

  // If Mammoth extracted meaningful text, use it
  if (text.trim().length >= 50) {
    return { text, needsOcr: false };
  }

  // Near-empty text — try OCR on the embedded images
  if (images.length === 0) {
    console.warn(`[docxParser] Empty text and no embedded images in DOCX — cannot extract content`);
    return { text: "", needsOcr: false };
  }

  console.warn(`[docxParser] Near-empty text (${text.trim().length} chars), OCR-ing ${images.length} embedded image(s)`);

  const settings = getSettings();
  const lang = settings.ocrLanguage;
  const tmpDir = join(tmpdir(), `docx-ocr-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const worker = await createWorker(lang);
  const parts: string[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      const { buffer, ext } = images[i];
      const imgPath = join(tmpDir, `page-${i}.${ext}`);
      writeFileSync(imgPath, buffer);
      const { data } = await worker.recognize(imgPath);
      if (data.text?.trim()) parts.push(data.text.trim());
    }
  } finally {
    await worker.terminate();
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const ocrText = parts.join("\n\n");
  return { text: ocrText, needsOcr: true };
}
