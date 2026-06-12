const DB_NAME = 'TrulivaOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'reportQueue';

export interface OfflineReport {
  id: string; // ID tự phát sinh để định danh trong hàng đợi
  orderId: string;
  payload: any; // Dữ liệu form báo cáo
  files: File[]; // Danh sách các đối tượng File ảnh chụp từ điện thoại
  createdAt: number;
}

/**
 * Khởi tạo kết nối IndexedDB
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Không thể khởi tạo cơ sở dữ liệu ngoại tuyến (IndexedDB)'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Thêm báo cáo mới vào hàng đợi ngoại tuyến (lưu cả dữ liệu và File ảnh gốc)
 */
export async function enqueueReport(orderId: string, payload: any, files: File[]): Promise<string> {
  const db = await initDB();
  const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const record: OfflineReport = {
    id,
    orderId,
    payload,
    files,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => {
      resolve(id);
    };

    request.onerror = () => {
      reject(request.error || new Error('Lỗi khi thêm báo cáo vào hàng đợi ngoại tuyến'));
    };
  });
}

/**
 * Lấy toàn bộ hàng đợi báo cáo đang chờ đồng bộ
 */
export async function getQueue(): Promise<OfflineReport[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error || new Error('Lỗi khi đọc hàng đợi báo cáo ngoại tuyến'));
      };
    });
  } catch (err) {
    console.error('OfflineStorage getQueue error', err);
    return [];
  }
}

/**
 * Xóa một báo cáo khỏi hàng đợi sau khi đã đồng bộ thành công
 */
export async function dequeueReport(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error || new Error('Lỗi khi xóa báo cáo khỏi hàng đợi ngoại tuyến'));
    };
  });
}
