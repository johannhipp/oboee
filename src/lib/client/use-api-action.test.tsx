// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseErrorMessage, useApiAction } from "./use-api-action";

afterEach(cleanup);

describe("useApiAction", () => {
  it("reports results when React replays effects in Strict Mode", async () => {
    const { result } = renderHook(
      () =>
        useApiAction<number>({
          successMessage: (value) => `saved ${value}`,
        }),
      { wrapper: StrictMode },
    );

    await act(() => result.current.run(async () => 3));

    expect(result.current.state).toEqual({
      phase: "success",
      message: "saved 3",
    });
  });

  it("reports success and calls the injected success effect", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useApiAction<number>({
        successMessage: (value) => `saved ${value}`,
        onSuccess,
      }),
    );

    await act(() => result.current.run(async () => 3));

    expect(result.current.state).toEqual({
      phase: "success",
      message: "saved 3",
    });
    expect(onSuccess).toHaveBeenCalledWith(3);
  });

  it("surfaces thrown errors and ignores a concurrent submit", async () => {
    let resolve: ((value: number) => void) | undefined;
    const pending = new Promise<number>((done) => {
      resolve = done;
    });
    const action = vi.fn(() => pending);
    const { result } = renderHook(() =>
      useApiAction<number>({ successMessage: () => "saved" }),
    );

    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.run(action);
      await result.current.run(action);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve?.(1);
      await first;
    });

    await act(() =>
      result.current.run(async () => {
        throw new Error("structured failure");
      }),
    );
    expect(result.current.state).toEqual({
      phase: "error",
      message: "structured failure",
    });
  });

  it("does not run success effects after unmount", async () => {
    let resolve: (() => void) | undefined;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() =>
      useApiAction<void>({ successMessage: () => "saved", onSuccess }),
    );
    const request = result.current.run(() => pending);
    unmount();
    resolve?.();
    await request;
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("extracts structured errors and handles non-JSON responses", async () => {
    await expect(
      responseErrorMessage(
        Response.json({ code: "INVALID_STATE", message: "Already closed." }, { status: 409 }),
      ),
    ).resolves.toBe("Already closed.");
    await expect(
      responseErrorMessage(new Response("gateway down", { status: 502 })),
    ).resolves.toBe("Request failed (502).");
  });
});
