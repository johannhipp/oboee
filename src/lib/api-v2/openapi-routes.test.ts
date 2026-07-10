import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";

const appRoot = join(process.cwd(), "src", "app");
const routeFileFor = (openApiPath: string) => join(
  appRoot,
  ...openApiPath.split("/").filter(Boolean).map((segment) => {
    const parameter = /^\{(.+)\}$/.exec(segment);
    return parameter ? `[${parameter[1]}]` : segment;
  }),
  "route.ts",
);

describe("v2 OpenAPI route inventory", () => {
  it.each(Object.keys(openApiDocument.paths))("has a route module for %s", (path) => {
    expect(existsSync(routeFileFor(path)), routeFileFor(path)).toBe(true);
  });

  it("documents every implemented v2 route module", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
    const routeRoot = join(appRoot, "api", "v2");
    const implemented = walk(routeRoot).filter((file) => file.endsWith("route.ts")).map((file) => {
      const relative = file.slice(appRoot.length, -"/route.ts".length);
      return relative.split("/").map((segment) => { const parameter = /^\[(.+)\]$/.exec(segment); return parameter ? `{${parameter[1]}}` : segment; }).join("/");
    });
    expect(implemented.sort()).toEqual(Object.keys(openApiDocument.paths).sort());
  });
});
