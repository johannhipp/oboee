import { anyApi } from "convex/server";
import { fetchMutation } from "convex/nextjs";

import { privilegedSessionPayload } from "../../../../../shared/authorization-envelope";
import { signServerEnvelope } from "../../../../../shared/server-envelope";
import { handler } from "@/lib/auth-server";

export const GET = handler.GET;

const envelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("OBOE_SERVER_ENVELOPE_SECRET is not configured.");
  return secret;
};

export async function POST(request: Request) {
  const response = await handler.POST(request);
  if (!response.ok || !new URL(request.url).pathname.endsWith("/passkey/verify-authentication")) return response;
  try {
    const result = await response.clone().json() as unknown;
    if (!result || typeof result !== "object" || !("session" in result) || !("user" in result)) return response;
    const session = result.session;
    const user = result.user;
    if (!session || typeof session !== "object" || !("id" in session) || typeof session.id !== "string" || !user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string") return response;
    const authenticatedAt = Date.now();
    const payload = privilegedSessionPayload({ principalId: user.id, sessionId: session.id, authenticatedAt });
    await fetchMutation(anyApi.delegations.registerVerifiedPasskeySession, {
      principalId: user.id,
      sessionId: session.id,
      authenticatedAt,
      envelopeSignature: signServerEnvelope(envelopeSecret(), payload),
    });
  } catch {
    // Authentication succeeded, but privileged actions remain denied until a later passkey verification is attested.
  }
  return response;
}
