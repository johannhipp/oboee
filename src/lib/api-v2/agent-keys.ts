import { anyApi } from "convex/server";
import { z } from "zod";

import { apiKeyAuthorizationPayload, canonicalStringList } from "../../../shared/authorization-envelope";
import { signServerEnvelope } from "../../../shared/server-envelope";
import { fetchPrincipalMutation, fetchPrincipalQuery } from "@/lib/api-auth";
import { handler as authHandler } from "@/lib/auth-server";
import { v2Authenticated, v2Command } from "./route";
import { v2Error, v2Success } from "./responses";

const marketplacePermission = z.enum(["rfs:read", "rfs:write", "fund", "apply", "submit", "evaluate", "purchase", "settlement:read"]);
const keySchema = z.object({
  name: z.string().min(1).max(80),
  expiresIn: z.number().int().min(60).max(365 * 24 * 60 * 60).optional(),
  permissions: z.array(marketplacePermission).min(1),
});

const envelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) throw Object.assign(new Error("API-key authorization signing is not configured."), { code: "CONFIGURATION_ERROR" });
  return secret;
};

const requireCookieSession = (method: "api_key" | "cookie") => {
  if (method !== "cookie") throw Object.assign(new Error("Agent keys can only be managed by an interactive human session."), { code: "FORBIDDEN" });
};

const permissionStatement = (permissions: readonly z.infer<typeof marketplacePermission>[]) => ({
  rfs: permissions.filter((permission) => permission === "rfs:read" || permission === "rfs:write").map((permission) => permission.split(":")[1]),
  marketplace: permissions.filter((permission) => !permission.includes(":")),
  skills: permissions.includes("purchase") ? ["purchase"] : [],
  settlement: permissions.includes("settlement:read") ? ["read"] : [],
});

const proxyAuth = async (request: Request, path: string, method: "GET" | "POST", body?: unknown) => {
  const target = new URL(`/api/auth${path}`, request.url);
  const headers = new Headers(request.headers);
  headers.delete("x-api-key");
  if (body !== undefined) headers.set("content-type", "application/json");
  const proxied = new Request(target, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return method === "GET" ? await authHandler.GET(proxied) : await authHandler.POST(proxied);
};

export const listAgentKeys = v2Authenticated(async ({ request, requestId, authentication }) => {
  requireCookieSession(authentication.method);
  const response = await proxyAuth(request, "/api-key/list", "GET");
  if (!response.ok) return v2Error({ requestId, code: "agent_key_list_failed", message: "Agent keys could not be listed.", status: response.status });
  const result = z.object({ apiKeys: z.array(z.record(z.string(), z.unknown())) }).passthrough().parse(await response.json());
  const sanitized = result.apiKeys.map((apiKey) => Object.fromEntries(Object.entries(apiKey).filter(([field]) => field !== "key")));
  return v2Success({ requestId, data: sanitized, links: { delegations: "/api/v2/me/delegations" } });
});

export const createAgentKey = v2Command({
  action: "create_agent_key",
  schema: keySchema,
  handler: async ({ request, requestId, authentication, input }) => {
    requireCookieSession(authentication.method);
    const permissions = canonicalStringList(input.permissions);
    const response = await proxyAuth(request, "/api-key/create", "POST", {
      name: input.name,
      expiresIn: input.expiresIn,
      permissions: permissionStatement(input.permissions),
      metadata: { oboePermissions: permissions },
    });
    if (!response.ok) throw Object.assign(new Error("Agent key creation failed."), { code: "AGENT_KEY_CREATE_FAILED" });
    const created = z.object({ id: z.string().min(1), key: z.string().min(1) }).passthrough().parse(await response.json());
    const principalId = await fetchPrincipalQuery(anyApi.principals.getMyPrincipalId, {}, authentication) as string;
    const issuedAt = Date.now();
    const envelopeSignature = signServerEnvelope(envelopeSecret(), apiKeyAuthorizationPayload({ principalId, apiKeyId: created.id, permissions, issuedAt }));
    await fetchPrincipalMutation(anyApi.delegations.registerApiKeyAuthorization, { apiKeyId: created.id, permissions, issuedAt, envelopeSignature }, authentication);
    const data = { ...created, warning: "The full key is returned once. Store it as a secret." };
    const result = { data, capabilities: [], links: { delegations: "/api/v2/me/delegations" } };
    return { response: v2Success({ requestId, data, status: 201, links: result.links }), result, resourceType: "agentKey", resourceId: created.id };
  },
});

export const deleteAgentKey = v2Command({
  action: "delete_agent_key",
  schema: z.object({ keyId: z.string().min(1) }),
  handler: async ({ request, requestId, authentication, input }) => {
    requireCookieSession(authentication.method);
    const response = await proxyAuth(request, "/api-key/delete", "POST", input);
    if (!response.ok) throw Object.assign(new Error("Agent key deletion failed."), { code: "AGENT_KEY_DELETE_FAILED" });
    const data = { deleted: true, keyId: input.keyId };
    const result = { data, capabilities: [], links: { keys: "/api/v2/me/agent-keys" } };
    return { response: v2Success({ requestId, data, links: result.links }), result, resourceType: "agentKey", resourceId: input.keyId };
  },
});
