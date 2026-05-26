import {chromium} from "@playwright/test";
import fs from "fs/promises";
import path from "path";

export default async function globalSetup() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set TEST_EMAIL and TEST_PASSWORD in tests/.env.test\n" +
      "Register the account at http://localhost:5173 and verify the email first."
    );
  }

  const res = await fetch("http://localhost:3737/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(`Login failed (${res.status}): ${err.error}`);
  }

  const rawCookie = res.headers.get("set-cookie") ?? "";
  const sessionMatch = rawCookie.match(/session=([^;]+)/);
  if (!sessionMatch) throw new Error("No session cookie in login response");

  const authDir = path.resolve("tests/e2e/.auth");
  await fs.mkdir(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "session",
      value: sessionMatch[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.storageState({ path: path.join(authDir, "user.json") });
  await browser.close();

  console.log(`✓ Auth state saved for ${email}`);
}