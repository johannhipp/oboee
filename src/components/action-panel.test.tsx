// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvailableAction } from "@/lib/actions";
import { ActionPanel } from "./rfs-actions/action-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("ActionPanel", () => {
  it("renders only actions provided by the server", () => {
    const actions = [
      { kind: "read", skillId: "skill-id" },
    ] as unknown as AvailableAction[];

    render(<ActionPanel actions={actions} signedIn />);

    expect(screen.getByRole("button", { name: "read skill" })).toBeTruthy();
    expect(screen.queryByText("claim & write this skill")).toBeNull();
    expect(screen.queryByText("submit & publish skill")).toBeNull();
    expect(screen.queryByText("prepare testnet contribution")).toBeNull();
  });
});
