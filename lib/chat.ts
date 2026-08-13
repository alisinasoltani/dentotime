// lib/chat.ts
import api from "./api";
import type { ChatThread, ChatMessage } from "./types";

export const getThreads = async (search?: string): Promise<ChatThread[]> => {
  const res = await api.get("/chat/threads/", { params: { search } });
  const data = res.data;
  // Handle both direct array and paginated response
  return Array.isArray(data) ? data : data.results || [];
};

export const getMessages = async (
  threadId: string | number,
): Promise<ChatMessage[]> => {
  const res = await api.get(`/chat/threads/${threadId}/messages/`);
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data.results || [];
};

export const sendMessageApi = async (
  threadId: string,
  body: string,
  assetIds: string[] = [],
) => {
  const payload: { body?: string; asset_ids?: string[] } = {};

  // فقط اگر متن داشت، کلید body را اضافه کن
  if (body && body.trim() !== "") {
    payload.body = body;
  }

  // اگر فایلی داشت، کلید attachments را اضافه کن
  if (assetIds.length > 0) {
    payload.asset_ids = assetIds;
  }

  const res = await api.post(`/chat/threads/${threadId}/messages/`, payload);
  return res.data;
};

export const markThreadRead = async (
  threadId: string | number,
): Promise<void> => {
  await api.patch(`/chat/threads/${threadId}/read/`);
};

// تغییر مسیر به بخش ادمین
export const deleteThreadApi = async (
  threadId: string | number,
): Promise<void> => {
  await api.delete(`/admin/chat/threads/${threadId}/`);
};

export async function getOrCreateThread(): Promise<ChatThread> {
  const res = await api.post<ChatThread>("/chat/threads/get_or_create/");
  return res.data;
}
