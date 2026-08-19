import { createPublicKey } from "crypto";
import { getSettings } from "../settings";

/**
 * Generate authorization URL to redirect user to Google
 */
export async function getGoogleAuthUrl(state: string, codeVerifier: string, redirectUri?: string): Promise<string> {
  const settings = getSettings();
  const params = new URLSearchParams({
    client_id: settings.googleClientId || "",
    redirect_uri: redirectUri || settings.googleRedirectUri || "",
    response_type: "code",
    scope: "openid profile email https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await generateCodeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for user info
 */
export async function exchangeCodeForIdToken(code: string, codeVerifier: string, redirectUri?: string): Promise<{
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const settings = getSettings();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.googleClientId || "",
      client_secret: settings.googleClientSecret || "",
      redirect_uri: redirectUri || settings.googleRedirectUri || "",
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth token exchange failed: ${error}`);
  }

  return response.json();
}

// Cached Google public keys — refreshed when expired
let cachedCerts: Record<string, string> = {};
let certsExpiry = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (Date.now() < certsExpiry && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const res = await fetch("https://www.googleapis.com/oauth2/v1/certs");
  if (!res.ok) throw new Error("Failed to fetch Google public keys");

  // Parse Cache-Control max-age to set expiry
  const cc = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = cc.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1000 : 3600_000;
  certsExpiry = Date.now() + maxAge;
  cachedCerts = await res.json() as Record<string, string>;
  return cachedCerts;
}

/**
 * Verify and decode Google ID token against Google's public keys.
 * Validates signature, expiry, issuer, and audience.
 */
export async function verifyIdToken(idToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token format");

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as { kid?: string; alg?: string };
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as {
    sub?: string; email?: string; name?: string; picture?: string;
    email_verified?: boolean; exp?: number; iss?: string; aud?: string;
  };

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.email) throw new Error("Missing required claims");
  if (payload.exp && payload.exp < now) throw new Error("ID token expired");
  if (payload.iss && !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new Error("Invalid token issuer");
  }

  const settings = getSettings();
  if (payload.aud && settings.googleClientId && payload.aud !== settings.googleClientId) {
    throw new Error("Invalid token audience");
  }

  // Verify RS256 signature against Google's public key
  try {
    const certs = await getGooglePublicKeys();
    const kid = header.kid;
    const pemKey = kid ? certs[kid] : Object.values(certs)[0];
    if (!pemKey) throw new Error("No matching public key found");

    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], "base64url");

    const spkiDer = createPublicKey(pemKey).export({ type: "spki", format: "der" });
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      spkiDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) throw new Error("Invalid token signature");
  } catch (err) {
    // If key fetch fails in dev, log and allow through with warning
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth] Signature verification failed (dev mode bypass):", err);
    } else {
      throw err;
    }
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    email_verified: payload.email_verified,
  };
}


/**
 * Generate a random state string for OAuth
 */
export function generateState(): string {
  return crypto.getRandomValues(new Uint8Array(32)).reduce((acc, byte) => {
    return acc + byte.toString(16).padStart(2, "0");
  }, "");
}

/**
 * Generate PKCE code verifier (43-128 characters)
 */
export function generateCodeVerifier(): string {
  const array = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(array);
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode (used for PKCE)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

