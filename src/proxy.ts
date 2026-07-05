/**
 * Proxy-aware fetch. In sandboxed/cloud environments all egress must go through
 * HTTPS_PROXY, but Node's global fetch ignores proxy env vars. When a proxy is
 * configured we route through undici's EnvHttpProxyAgent (it also honors
 * NO_PROXY); otherwise this is the plain global fetch — zero effect locally.
 */
import { fetch as undiciFetch, EnvHttpProxyAgent } from "undici";

const hasProxy = !!(
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy
);

const agent = hasProxy ? new EnvHttpProxyAgent() : undefined;

export const fetch: typeof globalThis.fetch = hasProxy
  ? (((input: any, init?: any) => undiciFetch(input, { ...init, dispatcher: agent })) as unknown as typeof globalThis.fetch)
  : globalThis.fetch;
