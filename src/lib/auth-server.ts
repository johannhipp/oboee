import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import type { Preloaded } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import type { EmptyObject } from "convex-helpers";

type OptionalArgs<FuncRef extends FunctionReference<"query" | "mutation" | "action">> =
  FuncRef["_args"] extends EmptyObject ? [args?: EmptyObject] : [args: FuncRef["_args"]];

interface AuthServer {
  getToken: () => Promise<string | undefined>;
  handler: {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
  isAuthenticated: () => Promise<boolean>;
  preloadAuthQuery: <Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalArgs<Query>
  ) => Promise<Preloaded<Query>>;
  fetchAuthQuery: <Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalArgs<Query>
  ) => Promise<FunctionReturnType<Query>>;
  fetchAuthMutation: <Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: OptionalArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
  fetchAuthAction: <Action extends FunctionReference<"action">>(
    action: Action,
    ...args: OptionalArgs<Action>
  ) => Promise<FunctionReturnType<Action>>;
}

let authServer: AuthServer | null = null;

const missingConvexConfig = () => {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return "NEXT_PUBLIC_CONVEX_URL is not set.";
  }
  if (!process.env.NEXT_PUBLIC_CONVEX_SITE_URL) {
    return "NEXT_PUBLIC_CONVEX_SITE_URL is not set.";
  }
  return null;
};

export const convexUnavailableMessage = () =>
  missingConvexConfig() ?? "Convex is not reachable from this environment.";

export const isConvexConfigured = () => missingConvexConfig() === null;
export type AuthenticationStatus = "authenticated" | "unauthenticated" | "unavailable";


const getAuthServer = () => {
  const missingConfig = missingConvexConfig();
  if (missingConfig) {
    throw new Error(missingConfig);
  }

  authServer ??= convexBetterAuthNextJs({
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
    convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  });

  return authServer;
};

const unavailableAuthResponse = () =>
  Response.json(
    {
      status: "error",
      code: "CONVEX_UNAVAILABLE",
      message: convexUnavailableMessage(),
    },
    { status: 503 },
  );

export const handler = {
  GET: (request: Request) => {
    try {
      return getAuthServer().handler.GET(request);
    } catch {
      return unavailableAuthResponse();
    }
  },
  POST: (request: Request) => {
    try {
      return getAuthServer().handler.POST(request);
    } catch {
      return unavailableAuthResponse();
    }
  },
};

export const preloadAuthQuery: AuthServer["preloadAuthQuery"] = (query, ...args) =>
  getAuthServer().preloadAuthQuery(query, ...args);

export const fetchAuthQuery: AuthServer["fetchAuthQuery"] = (query, ...args) =>
  getAuthServer().fetchAuthQuery(query, ...args);

export const fetchAuthMutation: AuthServer["fetchAuthMutation"] = (mutation, ...args) =>
  getAuthServer().fetchAuthMutation(mutation, ...args);

export const fetchAuthAction: AuthServer["fetchAuthAction"] = (action, ...args) =>
  getAuthServer().fetchAuthAction(action, ...args);

export const getAuthenticationStatus = async (): Promise<AuthenticationStatus> => {
  try {
    return (await getAuthServer().isAuthenticated()) ? "authenticated" : "unauthenticated";
  } catch {
    return "unavailable";
  }
};

export const isAuthenticated: AuthServer["isAuthenticated"] = async () =>
  (await getAuthenticationStatus()) === "authenticated";

export const getToken: AuthServer["getToken"] = async () => {
  try {
    return await getAuthServer().getToken();
  } catch {
    return undefined;
  }
};
