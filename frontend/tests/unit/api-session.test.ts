import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import api from "@/lib/api";
import { clearTokens, getAccessToken, setAccessToken } from "@/lib/auth";

afterEach(() => { clearTokens(); vi.unstubAllGlobals(); });

describe("session entry requests", () => {
  it("never attaches another account's bearer token to a password login", async () => {
    setAccessToken("expired-previous-account-token");
    let sent: InternalAxiosRequestConfig | undefined;
    await api.post("/auth/login/", { phone_number: "+989120001204", password: "example", user_type: "DOCTOR" }, {
      adapter: async (config) => {
        sent = config;
        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
      },
    });
    expect(sent?.headers.Authorization).toBeUndefined();
    expect(sent?.headers["X-Device-ID"]).toBeTruthy();
  });

  it("does not let an old account's delayed 401 refresh the new account", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("old-account-access");
    const request = api.get("/users/me/", {
      adapter: async (config) => {
        setAccessToken("new-account-access");
        throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null,
          { data: {}, status: 401, statusText: "Unauthorized", headers: {}, config });
      },
    });
    await expect(request).rejects.toThrow("Unauthorized");
    expect(getAccessToken()).toBe("new-account-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not clear a new login after a previous API refresh fails", async () => {
    setAccessToken("old-account-access");
    vi.stubGlobal("fetch", vi.fn(async () => {
      setAccessToken("new-account-access");
      return new Response("{}", { status: 401 });
    }));
    await expect(api.get("/users/me/", {
      adapter: async (config) => {
        throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null,
          { data: {}, status: 401, statusText: "Unauthorized", headers: {}, config });
      },
    })).rejects.toThrow("Unauthorized");
    expect(getAccessToken()).toBe("new-account-access");
  });
});
