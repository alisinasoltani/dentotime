import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTokens,
  createClientId,
  getDeviceId,
  getAccessToken,
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

  it("does not restore a session from a refresh response arriving after logout", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    setAccessToken("old-access");
    const pending = restoreSession(true);
    clearTokens();
    finish(new Response(JSON.stringify({ access: "late-old-access" })));

    await expect(pending).resolves.toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem("dentotime_has_session")).toBeNull();
  });

  it("does not erase a new login when an older refresh fails", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    setAccessToken("old-access");
    const pending = restoreSession(true);
    clearTokens();
    setAccessToken("new-account-access");
    finish(new Response("{}", { status: 401 }));

    await expect(pending).resolves.toBe(false);
    expect(getAccessToken()).toBe("new-account-access");
    expect(localStorage.getItem("dentotime_has_session")).toBe("1");
  });
});
