import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { readAuthServerConfiguration } from "./env/server";

type AuthServer = ReturnType<typeof convexBetterAuthNextJs>;

let authServer: AuthServer | null = null;

const getAuthServer = () => {
  const { convexUrl, convexSiteUrl } = readAuthServerConfiguration();

  authServer ??= convexBetterAuthNextJs({
    convexUrl,
    convexSiteUrl,
  });

  return authServer;
};

export const handler = {
  GET: (request: Request) => getAuthServer().handler.GET(request),
  POST: (request: Request) => getAuthServer().handler.POST(request),
};

export const fetchAuthQuery: AuthServer["fetchAuthQuery"] = (query, ...args) =>
  getAuthServer().fetchAuthQuery(query, ...args);

export const fetchAuthMutation: AuthServer["fetchAuthMutation"] = (mutation, ...args) =>
  getAuthServer().fetchAuthMutation(mutation, ...args);

export const isAuthenticated: AuthServer["isAuthenticated"] = () =>
  getAuthServer().isAuthenticated();

export const getToken: AuthServer["getToken"] = () => getAuthServer().getToken();
