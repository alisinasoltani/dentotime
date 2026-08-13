import api from './api';

interface DownloadGrant {
  url: string;
  expires_in: number;
}

export async function openPrivateAsset(assetId: string): Promise<void> {
  const response = await api.post<DownloadGrant>(`/files/assets/${assetId}/download/`);
  const opened = window.open(response.data.url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(response.data.url);
}
