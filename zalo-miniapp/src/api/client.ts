export const API_BASE_URL = 'https://trulivaofficial.com/api';

export function getSafeStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function setSafeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

export async function fetchZaloApi(endpoint: string, options: RequestInit = {}) {
  const token = getSafeStorage('zalo_session_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Có lỗi xảy ra khi kết nối máy chủ Truliva');
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Kết nối máy chủ Truliva hết thời gian chờ (Timeout). Vui lòng kiểm tra kết nối mạng.');
    }
    throw err;
  }
}
