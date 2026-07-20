export const API_BASE_URL = 'https://truliva-ktv-webapp.onrender.com/api';

export async function fetchZaloApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('zalo_session_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra khi kết nối máy chủ Truliva');
  }

  return data;
}
