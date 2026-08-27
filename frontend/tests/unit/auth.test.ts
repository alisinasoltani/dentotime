import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTokens,
  createClientId,
  getDeviceId,
  restoreSession,
  setAccessToken,
} from "@/lib/auth";

describe("browser authentication helpers", () => {
  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a device UUID when randomUUID is unavailable on an HTTP origin", () => {
    let next = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => { bytes[index] = next++ % 256; });
        return bytes;
      },
    });

    const deviceId = getDeviceId();

    expect(deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(getDeviceId()).toBe(deviceId);
  });

  it("creates client ids when an HTTP browser exposes no crypto object", () => {
    vi.stubGlobal("crypto", undefined);

    expect(createClientId()).toMatch(/^[a-z0-9-]+$/);
    expect(() => getDeviceId()).not.toThrow();
  });

  it("does not call refresh for a visitor who has never logged in", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores and clears only a non-sensitive session marker", () => {
    setAccessToken("memory-only-access-token");
    expect(localStorage.getItem("dentotime_has_session")).toBe("1");
    expect(localStorage.getItem("access_token")).toBeNull();

    clearTokens();
    expect(localStorage.getItem("dentotime_has_session")).toBeNull();
  });
});
