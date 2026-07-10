import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import type { FunctionReference, FunctionReturnType } from "convex/server";

import { getToken } from "@/lib/auth-server";

export type ApiAuthentication = {
  token: string;
  method: "api_key" | "cookie";
};

export class ApiAuthenticationError extends Error {
  readonly status = 401;
  readonly code = "authentication_required";

  constructor(message = "Authenticate with a session cookie or x-api-key.") {
    super(message);
    this.name = "ApiAuthenticationError";
  }
}

type TokenResolver = () => Promise<string | undefined>;

export const resolveApiAuthentication = async (
  request: Request,
  tokenResolver: TokenResolver = getToken,
): Promise<ApiAuthentication> => {
  const hasApiKey = Boolean(request.headers.get("x-api-key")?.trim());
  const hasCookie = Boolean(request.headers.get("cookie")?.trim());
  if (!hasApiKey && !hasCookie) {
    throw new ApiAuthenticationError();
  }
  const token = await tokenResolver();
  if (!token) {
    throw new ApiAuthenticationError("The supplied credentials are invalid, expired, or revoked.");
  }
  return { token, method: hasApiKey ? "api_key" : "cookie" };
};

type FunctionArgs<Reference extends FunctionReference<"query" | "mutation" | "action">> =
  Reference["_args"];

export const fetchPrincipalQuery = async <Reference extends FunctionReference<"query">>(
  reference: Reference,
  args: FunctionArgs<Reference>,
  authentication: ApiAuthentication,
): Promise<FunctionReturnType<Reference>> =>
  await fetchQuery(reference, args, { token: authentication.token });

export const fetchPrincipalMutation = async <Reference extends FunctionReference<"mutation">>(
  reference: Reference,
  args: FunctionArgs<Reference>,
  authentication: ApiAuthentication,
): Promise<FunctionReturnType<Reference>> =>
  await fetchMutation(reference, args, { token: authentication.token });

export const fetchPrincipalAction = async <Reference extends FunctionReference<"action">>(
  reference: Reference,
  args: FunctionArgs<Reference>,
  authentication: ApiAuthentication,
): Promise<FunctionReturnType<Reference>> =>
  await fetchAction(reference, args, { token: authentication.token });
