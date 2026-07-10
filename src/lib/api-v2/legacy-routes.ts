type LegacyRoute = {
  replacementMethod?: "GET" | "POST";
  replacementPath?: string;
  message: string;
};

const OPENAPI_PATH = "/api/v2/openapi.json";
const MIGRATION_GUIDE_PATH = "/docs/api-v2-migration";
const SUNSET_DATE = "2026-07-10";

export const retiredApiResponse = (route: LegacyRoute) =>
  Response.json(
    {
      status: "error",
      code: "api_version_retired",
      message: route.message,
      apiVersion: "v2",
      replacement:
        route.replacementMethod && route.replacementPath
          ? { method: route.replacementMethod, path: route.replacementPath }
          : null,
      links: {
        openapi: OPENAPI_PATH,
        migrationGuide: MIGRATION_GUIDE_PATH,
      },
      sunsetDate: SUNSET_DATE,
    },
    {
      status: 410,
      headers: {
        Deprecation: "true",
        Sunset: "Fri, 10 Jul 2026 00:00:00 GMT",
        Link: `<${MIGRATION_GUIDE_PATH}>; rel="deprecation", <${OPENAPI_PATH}>; rel="describedby"`,
      },
    },
  );
