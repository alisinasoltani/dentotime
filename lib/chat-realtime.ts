import { getAccessToken, restoreSession } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import type { ChatMessage } from "@/lib/types";


export interface ChatStreamResult {
  lastEventId: string | null;
  reason: "closed" | "reauthenticate" | "unavailable";
}

interface ChatStreamOptions {
  lastEventId: string | null;
  signal: AbortSignal;
  onMessage: (message: ChatMessage, eventId: string | null) => void;
}

function parseEvent(block: string) {
  let id: string | null = null;
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "id") id = value;
    else if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return { id, event, data: data.join("\n") };
}

export async function connectChatStream(
  threadId: string,
  options: ChatStreamOptions,
): Promise<ChatStreamResult> {
  if (!getAccessToken()) await restoreSession();
  const accessToken = getAccessToken();
  if (!accessToken) throw new Error("Chat stream authentication is unavailable.");

  const headers: HeadersInit = {
    Accept: "text/event-stream",
    Authorization: `Bearer ${accessToken}`,
    "Cache-Control": "no-cache",
  };
  if (options.lastEventId) headers["Last-Event-ID"] = options.lastEventId;
  const response = await fetch(
    `${API_BASE_URL}/api/v1/chat/threads/${threadId}/events/`,
    {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    },
  );
  if (response.status === 401) {
    await restoreSession(true);
    throw new Error("Chat stream authentication expired.");
  }
  if (!response.ok || !response.body) {
    throw new Error(`Chat stream failed with status ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventId = options.lastEventId;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseEvent(block);
        if (parsed.id) lastEventId = parsed.id;
        if (parsed.event === "message" && parsed.data) {
          const payload = JSON.parse(parsed.data) as { message: ChatMessage };
          options.onMessage(payload.message, parsed.id);
        } else if (parsed.event === "reauthenticate") {
          return { lastEventId, reason: "reauthenticate" };
        } else if (parsed.event === "unavailable") {
          return { lastEventId, reason: "unavailable" };
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) return { lastEventId, reason: "closed" };
    }
  } finally {
    reader.releaseLock();
  }
}
