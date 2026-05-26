import { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';

export default function MyReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const data = await fetchApi('/reports?limit=50');
      setReports(data.reports);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>;

  return (
    <div className="animate-fade-in">
      <h2 className="font-bold text-2xl mb-6 text-[#1B3A6B]">Lịch sử báo cáo của tôi</h2>
      
      {reports.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          Chưa có báo cáo nào được tạo.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold text-lg">{r.customerName}</div>
                <div className="text-sm text-gray-500">
                  {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-medium">Dịch vụ:</span> {r.serviceType}
              </div>
              
              <div className="text-sm text-gray-600">
                <span className="font-medium">Địa chỉ:</span> {r.province}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

