import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { API_ROUTE_CONTRACT } from "./contract";

const root = process.cwd();
const apiRoot = join(root, "src/app/api");

const routeFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? routeFiles(path)
      : name === "route.ts"
        ? [relative(root, path)]
        : [];
  });

describe("API route contract", () => {
  it("represents every route file and exported method exactly once", () => {
    const actual = routeFiles(apiRoot).flatMap((file) => {
      const source = readFileSync(join(root, file), "utf8");
      return ["GET", "POST", "PUT", "PATCH", "DELETE"].flatMap((method) =>
        new RegExp(`export (?:async function|const) ${method}\\b`).test(source)
          ? [`${method} ${file}`]
          : [],
      );
    });
    const declared = API_ROUTE_CONTRACT.map(
      (route) => `${route.method} ${route.file}`,
    );

    expect([...declared].sort()).toEqual([...actual].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("does not declare a payout claim surface", () => {
    expect(API_ROUTE_CONTRACT.some((route) => route.path.includes("payout"))).toBe(
      false,
    );
  });
});
