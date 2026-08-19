#!/usr/bin/env node
/**
 * One-time script to obtain a Gmail refresh token via OAuth2.
 * Works with both Web and Desktop/Installed OAuth clients.
 *
 * Usage:
 *   node scripts/gmail-get-refresh-token.cjs <CLIENT_ID> <CLIENT_SECRET>
 */

const http = require("http");
const { execSync } = require("child_process");
const crypto = require("crypto");

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: node scripts/gmail-get-refresh-token.cjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const PORT = 3939;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const codeVerifier = crypto.randomBytes(32).toString("base64url");

function getCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

(async () => {
  const codeChallenge = getCodeChallenge(codeVerifier);

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();

  console.log("\n=== Gmail Refresh Token Setup ===\n");
  console.log("Opening browser for Google consent...\n");

  try {
    execSync(`start "" "${authUrl}"`, { stdio: "ignore" });
  } catch {
    console.log("Could not open browser. Open this URL manually:\n");
    console.log(authUrl + "\n");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (!code && !error) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<p>Waiting for OAuth callback...</p>");
      return;
    }

    if (error) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>Error: ${error}</h2><p>Close this tab.</p>`);
      console.error(`\nError: ${error}`);
      process.exit(1);
    }

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }),
      });

      const data = await tokenRes.json();

      if (!tokenRes.ok) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h2>Token exchange failed</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
        console.error("\nToken exchange failed:", data);
        process.exit(1);
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>Success!</h2><p>Refresh token obtained. Check terminal. Close this tab.</p>`);

      console.log("\n=== SUCCESS ===\n");
      console.log("Add these to your server/.env:\n");
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GMAIL_REFRESH_TOKEN=${data.refresh_token}`);
      if (data.access_token) {
        console.log(`GMAIL_ACCESS_TOKEN=${data.access_token}`);
      }
      console.log("\nRefresh token does not expire unless revoked.\n");

      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      res.writeHead(500);
      res.end("Internal error");
      console.error(err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Waiting for Google callback on http://localhost:${PORT} ...\n`);
  });
})();
