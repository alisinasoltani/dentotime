import api from "./api";
import type {
  ChatContactDirectory,
  ChatMessage,
  ChatThread,
  MessageCursorPage,
  MessageDeltaPage,
  PaginatedResponse,
} from "./types";

export type ThreadPage = PaginatedResponse<ChatThread>;

export const getThreadsPage = async (
  search?: string,
  pageUrl?: string,
): Promise<ThreadPage> => {
  const response = await api.get(pageUrl || "/chat/threads/", {
    params: pageUrl ? undefined : { search },
  });
  return response.data;
};

export const getThreads = async (search?: string): Promise<ChatThread[]> => {
  const page = await getThreadsPage(search);
  return page.results;
};

export const getMessages = async (
  threadId: string,
  pageUrl?: string,
): Promise<MessageCursorPage> => {
  const response = await api.get(
    pageUrl || `/chat/threads/${threadId}/messages/`,
  );
  return response.data;
};

export const getMessageDeltas = async (
  threadId: string,
  after: string,
  signal?: AbortSignal,
): Promise<MessageDeltaPage> => {
  const response = await api.get(
    `/chat/threads/${threadId}/messages/delta/`,
    { params: { after }, signal },
  );
  return response.data;
};

export const sendMessageApi = async (
  threadId: string,
  body: string,
  assetIds: string[] = [],
  visibility: ChatMessage["visibility"] = "PARTICIPANTS",
): Promise<ChatMessage> => {
  const payload: {
    body?: string;
    asset_ids?: string[];
    visibility: ChatMessage["visibility"];
  } = { visibility };
  if (body.trim()) payload.body = body.trim();
  if (assetIds.length) payload.asset_ids = assetIds;
  const response = await api.post(
    `/chat/threads/${threadId}/messages/`,
    payload,
  );
  return response.data;
};

export const markThreadRead = async (threadId: string): Promise<void> => {
  await api.patch(`/chat/threads/${threadId}/read/`);
};

export const deleteThreadApi = async (threadId: string): Promise<void> => {
  await api.delete(`/admin/chat/threads/${threadId}/`);
};

export async function getOrCreateThread(): Promise<ChatThread> {
  const response = await api.post<ChatThread>(
    "/chat/threads/get_or_create/",
  );
  return response.data;
}

export async function getChatContacts(
  search = "",
  role: "ALL" | "USER" | "DOCTOR" = "ALL",
): Promise<ChatContactDirectory> {
  const response = await api.get<ChatContactDirectory>("/chat/contacts/", {
    params: { search, role },
  });
  return response.data;
}

export async function pinChatContact(contactId: string | number): Promise<void> {
  await api.post("/chat/contacts/pins/", { contact_id: contactId });
}

export async function unpinChatContact(contactId: string | number): Promise<void> {
  await api.delete(`/chat/contacts/${contactId}/pin/`);
}

export async function createDirectThread(
  contactId: string | number,
): Promise<ChatThread> {
  const response = await api.post<ChatThread>("/chat/threads/direct/", {
    contact_id: contactId,
  });
  return response.data;
}
