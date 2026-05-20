export const API_URL = '/api';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra');
  }

  return data;
}

export async function uploadImage(file: File): Promise<{ url: string; publicId: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    body: formData, // Không set Content-Type, trình duyệt tự set với boundary
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Lỗi upload ảnh');
  }

  return data;
}

export async function uploadImages(files: File[]): Promise<string[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append('images', f));

  const response = await fetch(`${API_URL}/upload/multiple`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Lỗi upload ảnh');
  }

  return data.urls;
}

export async function getOrders(params: Record<string, any> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        if (value.length > 0) {
          query.append(key, value.join(','));
        }
      } else {
        query.append(key, String(value));
      }
    }
  }
  
  const queryString = query.toString();
  const endpoint = queryString ? `/orders?${queryString}` : '/orders';
  return fetchApi(endpoint);
}

export async function updateOrder(id: string, data: any) {
  return fetchApi(`/orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getKtvUsers(params: { techStationId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.techStationId) query.append('techStationId', params.techStationId);
  const q = query.toString();
  return fetchApi(q ? `/users/ktvs?${q}` : '/users/ktvs');
}

export const getOrderAuditLog = async (id: string) => {
  return fetchApi(`/orders/${id}/audit`);
};

// --- STATIONS ---
export const getStations = async () => {
  return fetchApi('/stations');
};

export const createMainStation = async (name: string) => {
  return fetchApi('/stations/main', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
};

export const createTechStation = async (name: string, mainStationId: string) => {
  return fetchApi('/stations/tech', {
    method: 'POST',
    body: JSON.stringify({ name, mainStationId }),
  });
};

export const deleteMainStation = async (id: string) => {
  return fetchApi(`/stations/main/${id}`, { method: 'DELETE' });
};

export const deleteTechStation = async (id: string) => {
  return fetchApi(`/stations/tech/${id}`, { method: 'DELETE' });
};

// --- DASHBOARD ---
export const getDashboardStats = async () => {
  return fetchApi('/dashboard/stats');
};

export const deleteReport = async (id: string) => {
  return fetchApi(`/reports/${id}`, { method: 'DELETE' });
};
