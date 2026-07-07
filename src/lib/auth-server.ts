import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

type AuthServer = ReturnType<typeof convexBetterAuthNextJs>;

let authServer: AuthServer | null = null;

const getAuthServer = () => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }

  if (!convexSiteUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is required.");
  }

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

export const preloadAuthQuery: AuthServer["preloadAuthQuery"] = (query, ...args) =>
  getAuthServer().preloadAuthQuery(query, ...args);

export const fetchAuthQuery: AuthServer["fetchAuthQuery"] = (query, ...args) =>
  getAuthServer().fetchAuthQuery(query, ...args);

export const fetchAuthMutation: AuthServer["fetchAuthMutation"] = (mutation, ...args) =>
  getAuthServer().fetchAuthMutation(mutation, ...args);

export const fetchAuthAction: AuthServer["fetchAuthAction"] = (action, ...args) =>
  getAuthServer().fetchAuthAction(action, ...args);

export const isAuthenticated: AuthServer["isAuthenticated"] = () =>
  getAuthServer().isAuthenticated();

export const getToken: AuthServer["getToken"] = () => getAuthServer().getToken();
