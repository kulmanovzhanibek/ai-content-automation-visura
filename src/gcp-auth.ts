/**
 * gcp-auth: mint a short-lived GCP OAuth access token from a service-account
 * JSON string (the same GCP_SERVICE_ACCOUNT the image pipeline uses).
 *
 * Uses Web Crypto (globally available in Node 20+) to RS256-sign a JWT, then
 * exchanges it at Google's token endpoint for an access token. Shared by
 * gen-images (Vertex image gen) and gcs (Cloud Storage upload for Instagram).
 *
 * The default scope (cloud-platform) covers both Vertex AI and Cloud Storage.
 */
import { fetch } from "./proxy.ts";

export async function getGoogleAccessToken(
  serviceAccountJsonStr: string,
  scope = "https://www.googleapis.com/auth/cloud-platform"
): Promise<string> {
  const sa = JSON.parse(serviceAccountJsonStr);

  const encodeBase64Url = (str: string) =>
    btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodeJsonBase64Url = (obj: any) => encodeBase64Url(JSON.stringify(obj));

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwtString = `${encodeJsonBase64Url(header)}.${encodeJsonBase64Url(claimSet)}`;
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(jwtString)
  );
  const signedJwt = `${jwtString}.${encodeBase64Url(
    String.fromCharCode(...new Uint8Array(signature))
  )}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });
  const tokenData: any = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token as string;
}
