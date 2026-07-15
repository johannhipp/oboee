// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./copy-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("uses native button mouse, Enter, and Space behavior", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <CopyButton text="copy me" label="Copy value">
        copy
      </CopyButton>,
    );
    const button = screen.getByRole("button", { name: "Copy value" });

    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(writeText).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText("copied")).toHaveLength(2);
  });

  it("announces clipboard rejection", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    render(
      <CopyButton text="copy me" label="Copy value">
        copy
      </CopyButton>,
    );

    await user.click(screen.getByRole("button", { name: "Copy value" }));
    expect(screen.getByText("copy failed")).toBeTruthy();
  });
});
