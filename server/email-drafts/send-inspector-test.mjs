import {readFile} from "node:fs/promises";
import {config} from "dotenv";
import {Resend} from "resend";

config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});

const message = {
  from: "RemindOCR <contact@remindocr.com>",
  replyTo: "contact@remindocr.com",
  to: ["arshavsky.pasha@gmail.com"],
  subject: "ניהול דוחות ותזכורות לבדיקות — RemindOCR",
  html: await readFile(new URL("./inspector-introduction.html", import.meta.url), "utf8"),
  text: await readFile(new URL("./inspector-introduction.txt", import.meta.url), "utf8"),
};

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is required");
}
if (!message.html.includes('dir="rtl"') || !message.text.includes("אני פבל")) {
  throw new Error("Email content validation failed");
}

if (process.argv.includes("--send")) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const {data, error} = await resend.emails.send(message, {
    idempotencyKey: "inspectors-introduction-pasha-test-20260908-v2-contact-footer",
  });
  if (error) throw new Error(`${error.name}: ${error.message}`);
  console.log(JSON.stringify({status: "accepted", id: data.id, to: message.to, subject: message.subject}));
} else {
  console.log(JSON.stringify({status: "preview", from: message.from, to: message.to, subject: message.subject, text: message.text}));
}
