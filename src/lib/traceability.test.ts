import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const STORY_ID = /([A-Z]+-[A-Z]+-\d{2})/g;

function idsIn(path: string) {
  return [...readFileSync(resolve(process.cwd(), path), "utf8").matchAll(STORY_ID)].map(
    ([, id]) => id,
  );
}

describe("agent and human surface traceability", () => {
  it("maps every source story exactly once", () => {
    const source = idsIn("docs/agent-first-user-stories.md");
    const matrix = idsIn("plans/001-agent-human-surface-traceability.md");

    expect(new Set(source).size).toBe(103);
    expect(matrix).toHaveLength(103);
    expect([...matrix].sort()).toEqual([...new Set(source)].sort());
  });
});
