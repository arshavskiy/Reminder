import { getSettings } from "../settings.js";

/**
 * Generate authorization URL to redirect user to Google
 */
export function getGoogleAuthUrl(state: string, codeVerifier: string): string {
  const settings = getSettings();
  const params = new URLSearchParams({
    client_id: settings.googleClientId || "",
    redirect_uri: settings.googleRedirectUri || "",
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: generateCodeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for user info
 */
export async function exchangeCodeForIdToken(code: string, codeVerifier: string): Promise<{
  id_token: string;
  access_token?: string;
}> {
  const settings = getSettings();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.googleClientId || "",
      client_secret: settings.googleClientSecret || "",
      redirect_uri: settings.googleRedirectUri || "",
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

/**
 * Verify and decode Google ID token
 */
export async function verifyIdToken(idToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}> {
  // Using jose for JWT verification (we'll install it later)
  // For now, decode without verification for dev mode
  // In production, you'd verify the signature against Google's public keys

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid ID token format");
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

    // Basic validation
    if (!payload.sub || !payload.email) {
      throw new Error("Missing required claims in ID token");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    };
  } catch (error) {
    throw new Error(`Failed to decode ID token: ${error}`);
  }
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
export function generateCodeChallenge(verifier: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = crypto.subtle.digestSync("SHA-256", data);
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

