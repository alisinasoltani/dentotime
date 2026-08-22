"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { connectChatStream } from "@/lib/chat-realtime";
import {
  getMessageDeltas,
  getMessages,
  markThreadRead,
} from "@/lib/chat";
import type { ChatMessage } from "@/lib/types";


function chronological(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    const timeDifference =
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return timeDifference || String(left.id).localeCompare(String(right.id));
  });
}

function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const merged = new Map(current.map((message) => [String(message.id), message]));
  incoming.forEach((message) => merged.set(String(message.id), message));
  return chronological([...merged.values()]);
}

function waitFor(delay: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function reconnectDelay(attempt: number): number {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  return Math.round(ceiling * (0.75 + Math.random() * 0.5));
}

export function useChatHistory(threadId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderPageUrl, setOlderPageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "reconnecting" | "offline"
  >("idle");
  const latestMessageId = useRef<string | null>(null);
  const readTimer = useRef<number | null>(null);

  const scheduleRead = useCallback(() => {
    if (!threadId || readTimer.current !== null) return;
    readTimer.current = window.setTimeout(() => {
      readTimer.current = null;
      void markThreadRead(threadId).catch((error) =>
        console.error("Unable to update the chat read cursor", error),
      );
    }, 300);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setOlderPageUrl(null);
      latestMessageId.current = null;
      setConnectionStatus("idle");
      return;
    }
    let stopped = false;
    let connectionController: AbortController | null = null;
    let lastEventId: string | null = null;
    let onlineListener: (() => void) | null = null;
    let resolveOnlineWait: (() => void) | null = null;

    const reconcileDeltas = async (signal: AbortSignal) => {
      let cursor = latestMessageId.current;
      if (!cursor) return;
      let hasMore = true;
      while (!stopped && hasMore) {
        const page = await getMessageDeltas(threadId, cursor, signal);
        if (page.results.length) {
          setMessages((current) => mergeMessages(current, page.results));
          cursor = page.cursor;
          latestMessageId.current = cursor;
          scheduleRead();
        }
        hasMore = page.has_more;
      }
    };

    const waitUntilVisible = async () => {
      if (!document.hidden) return;
      await new Promise<void>((resolve) => {
        const listener = () => {
          if (!document.hidden || stopped) {
            document.removeEventListener("visibilitychange", listener);
            resolve();
          }
        };
        document.addEventListener("visibilitychange", listener);
      });
    };

    const waitUntilOnline = async () => {
      if (navigator.onLine) return;
      setConnectionStatus("offline");
      await new Promise<void>((resolve) => {
        resolveOnlineWait = resolve;
        onlineListener = () => {
          if (onlineListener) window.removeEventListener("online", onlineListener);
          onlineListener = null;
          resolveOnlineWait = null;
          resolve();
        };
        window.addEventListener("online", onlineListener, { once: true });
      });
    };

    const start = async () => {
      setMessages([]);
      setOlderPageUrl(null);
      latestMessageId.current = null;
      setIsLoading(true);
      setConnectionStatus(navigator.onLine ? "connecting" : "offline");
      try {
        const initial = await getMessages(threadId);
        if (stopped) return;
        const ordered = chronological(initial.results);
        setMessages(ordered);
        setOlderPageUrl(initial.next);
        latestMessageId.current = ordered.at(-1)?.id || null;
        scheduleRead();
      } catch (error) {
        if (!stopped) console.error("Unable to load message history", error);
      } finally {
        if (!stopped) setIsLoading(false);
      }

      let failedAttempts = 0;
      while (!stopped) {
        await waitUntilVisible();
        await waitUntilOnline();
        if (stopped) return;
        setConnectionStatus(failedAttempts ? "reconnecting" : "connecting");
        connectionController = new AbortController();
        const visibilityListener = () => {
          if (document.hidden) connectionController?.abort();
        };
        document.addEventListener("visibilitychange", visibilityListener);
        try {
          await reconcileDeltas(connectionController.signal);
          const result = await connectChatStream(threadId, {
            lastEventId,
            signal: connectionController.signal,
            onMessage(message, eventId) {
              setMessages((current) => mergeMessages(current, [message]));
              latestMessageId.current = message.id;
              if (eventId) lastEventId = eventId;
              scheduleRead();
            },
            onOpen() {
              setConnectionStatus("connected");
            },
          });
          lastEventId = result.lastEventId;
          failedAttempts = result.reason === "unavailable" ? failedAttempts + 1 : 0;
        } catch (error) {
          if (!stopped && !document.hidden && (error as Error).name !== "AbortError") {
            failedAttempts += 1;
            setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
            console.warn("Realtime chat reconnect scheduled", error);
          }
        } finally {
          document.removeEventListener("visibilitychange", visibilityListener);
          connectionController = null;
        }
        if (!stopped && !document.hidden) await waitFor(reconnectDelay(failedAttempts));
      }
    };

    void start();
    return () => {
      stopped = true;
      connectionController?.abort();
      if (onlineListener) window.removeEventListener("online", onlineListener);
      onlineListener = null;
      resolveOnlineWait?.();
      resolveOnlineWait = null;
      if (readTimer.current !== null) {
        window.clearTimeout(readTimer.current);
        readTimer.current = null;
      }
      document.dispatchEvent(new Event("visibilitychange"));
    };
  }, [scheduleRead, threadId]);

  const loadOlder = useCallback(async () => {
    if (!threadId || !olderPageUrl || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const page = await getMessages(threadId, olderPageUrl);
      setMessages((current) => mergeMessages(current, page.results));
      setOlderPageUrl(page.next);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, olderPageUrl, threadId]);

  return {
    messages,
    isLoading,
    isLoadingOlder,
    hasOlder: Boolean(olderPageUrl),
    connectionStatus,
    loadOlder,
    addOptimistic(message: ChatMessage) {
      setMessages((current) => mergeMessages(current, [message]));
    },
    replaceMessage(temporaryId: string, message: ChatMessage) {
      latestMessageId.current = message.id;
      setMessages((current) =>
        mergeMessages(
          current.filter((item) => String(item.id) !== temporaryId),
          [message],
        ),
      );
    },
    removeMessage(messageId: string) {
      setMessages((current) =>
        current.filter((message) => String(message.id) !== messageId),
      );
    },
  };
}
