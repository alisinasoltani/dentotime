"use client";

import { useCallback, useEffect, useState } from "react";

import { getMessages, markThreadRead } from "@/lib/chat";
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

export function useChatHistory(threadId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderPageUrl, setOlderPageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const refreshLatest = useCallback(
    async (replace = false) => {
      if (!threadId) return;
      const page = await getMessages(threadId);
      setMessages((current) =>
        replace
          ? chronological(page.results)
          : mergeMessages(current, page.results),
      );
      if (replace) setOlderPageUrl(page.next);
      await markThreadRead(threadId);
    },
    [threadId],
  );

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setOlderPageUrl(null);
      return;
    }
    let active = true;
    setMessages([]);
    setOlderPageUrl(null);
    setIsLoading(true);
    void refreshLatest(true)
      .catch((error) => {
        if (active) console.error("Unable to load message history", error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    const interval = window.setInterval(() => {
      void refreshLatest(false).catch((error) =>
        console.error("Unable to refresh message history", error),
      );
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshLatest, threadId]);

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
    loadOlder,
    addOptimistic(message: ChatMessage) {
      setMessages((current) => mergeMessages(current, [message]));
    },
    replaceMessage(temporaryId: string, message: ChatMessage) {
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
