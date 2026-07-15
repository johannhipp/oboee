// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MoneyText } from "./money-text";

afterEach(cleanup);

describe("MoneyText", () => {
  it("keeps distinct sub-cent amounts visible", () => {
    render(
      <div>
        <MoneyText baseUnits={BigInt(3_000)} />
        <MoneyText baseUnits={BigInt(9_000)} />
      </div>,
    );

    expect(screen.getByText("$0.003")).toBeTruthy();
    expect(screen.getByText("$0.009")).toBeTruthy();
  });
});
