import { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import { 
  Calendar, 
  MapPin, 
  Phone, 
  Wrench, 
  Droplets, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Tag, 
  FileText 
} from 'lucide-react';

export default function MyReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});

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

  const toggleExpand = (id: string) => {
    setExpandedReports(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getWorkTypeColor = (workType: string) => {
    switch (workType) {
      case 'Lắp đặt':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'Bảo hành':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'Sửa chữa':
        return 'text-purple-700 bg-purple-50 border-purple-200';
      case 'Thay lọc':
      case 'Thay lõi':
        return 'text-teal-700 bg-teal-50 border-teal-200';
      default:
        return 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  if (loading) return <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>;

  return (
    <div className="animate-fade-in max-w-2xl mx-auto px-4 pb-10">
      <h2 className="font-bold text-2xl mb-6 text-[#1B3A6B] flex items-center gap-2">
        <FileText className="w-6 h-6" /> Lịch sử báo cáo của tôi
      </h2>
      
      {reports.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          Chưa có báo cáo nào được tạo.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => {
            const isExpanded = !!expandedReports[r.id];
            const fullAddress = [r.address, r.province].filter(Boolean).join(', ') || 'N/A';
            const hasTechnicalData = r.waterSource || r.tdsIn !== null || r.tdsOut !== null || r.waterPressure !== null;
            const hasProblemData = r.issueType || r.handlingMethod;
            
            return (
              <div key={r.id} className="card hover:shadow-md transition-all duration-200 border border-gray-100 bg-white rounded-xl p-4">
                {/* Header */}
                <div className="flex justify-between items-start mb-3 border-b pb-3 border-gray-100">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-bold">
                        {r.order?.pancakeOrderId ? `#${r.order.pancakeOrderId}` : 'Đơn lẻ'}
                      </span>
                      {r.workType && (
                        <span className={`text-[11px] border px-2 py-0.5 rounded font-semibold ${getWorkTypeColor(r.workType)}`}>
                          {r.workType}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-base text-gray-800">{r.customerName}</span>
                  </div>
                  <div className="text-right text-xs text-gray-400 flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="text-[10px]">
                      {new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                
                {/* Quick Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <span className="text-gray-400 mr-1">SĐT:</span> 
                      <a href={`tel:${r.customerPhone}`} className="font-semibold text-blue-600 hover:underline">
                        {r.customerPhone}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="truncate">
                      <span className="text-gray-400 mr-1">Địa chỉ:</span> 
                      <span className="font-semibold text-gray-800" title={fullAddress}>{fullAddress}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <span className="text-gray-400 mr-1">Dịch vụ:</span> 
                      <span className="font-semibold text-gray-800">{r.serviceType || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <span className="text-gray-400 mr-1">Thu thực tế:</span> 
                      <span className="font-semibold text-emerald-600">{(r.actualAmount || 0).toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>
                  {r.serialNumber && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Tag className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <span className="text-gray-400 mr-1">Số serial:</span> 
                        <span className="font-mono font-bold text-gray-800">{r.serialNumber}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Call Customer status */}
                {r.order?.ktvCalledAt && (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      📞 Đã gọi khách lúc: {new Date(r.order.ktvCalledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(r.order.ktvCalledAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                )}

                {/* Collapsible Section */}
                {isExpanded && (
                  <div className="border-t pt-3 mt-3 border-dashed border-gray-200 text-xs text-gray-600 animate-slide-down flex flex-col gap-3">
                    {/* Products */}
                    {r.products && r.products.length > 0 && (
                      <div>
                        <span className="font-bold text-gray-500 block mb-1">Sản phẩm:</span>
                        <div className="flex flex-wrap gap-1">
                          {r.products.map((p: string, idx: number) => (
                            <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Water and pressure measurements */}
                    {hasTechnicalData && (
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-blue-500" /> Thông số nước & Áp suất
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {r.waterSource && (
                            <div>
                              <span className="text-gray-400">Nguồn nước:</span>{' '}
                              <span className="font-medium text-gray-700">{r.waterSource}</span>
                            </div>
                          )}
                          {r.waterPressure !== null && (
                            <div>
                              <span className="text-gray-400">Áp suất vào:</span>{' '}
                              <span className="font-medium text-gray-700">{r.waterPressure} psi</span>
                            </div>
                          )}
                          {r.tdsIn !== null && (
                            <div>
                              <span className="text-gray-400">TDS vào:</span>{' '}
                              <span className="font-medium text-gray-700">{r.tdsIn} ppm</span>
                            </div>
                          )}
                          {r.tdsOut !== null && (
                            <div>
                              <span className="text-gray-400">TDS ra:</span>{' '}
                              <span className="font-medium text-gray-700">{r.tdsOut} ppm</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Spare Parts */}
                    {r.spareParts && r.spareParts.length > 0 && (
                      <div>
                        <span className="font-bold text-gray-500 block mb-1">Linh kiện thay thế:</span>
                        <div className="flex flex-wrap gap-1">
                          {r.spareParts.map((part: string, idx: number) => (
                            <span key={idx} className="bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded font-medium">
                              {part}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Issue Cause & Method */}
                    {hasProblemData && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        {r.issueType && (
                          <div>
                            <span className="font-bold text-gray-500 block mb-0.5">Sự cố / Nguyên nhân:</span>
                            <span className="font-medium text-gray-700">{r.issueType}</span>
                          </div>
                        )}
                        {r.handlingMethod && (
                          <div>
                            <span className="font-bold text-gray-500 block mb-0.5">Cách xử lý:</span>
                            <span className="font-medium text-gray-700">{r.handlingMethod}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {r.notes && (
                      <div className="bg-yellow-50/55 p-2.5 rounded-lg border border-yellow-100/70">
                        <span className="font-bold text-amber-800 block mb-0.5">Ghi chú:</span>
                        <p className="text-gray-700 italic font-medium whitespace-pre-wrap">{r.notes}</p>
                      </div>
                    )}

                    {/* Distance */}
                    {r.distanceKm !== null && (
                      <div>
                        <span className="text-gray-400">Khoảng cách di chuyển:</span>{' '}
                        <span className="font-semibold text-gray-700">{r.distanceKm} km</span>
                      </div>
                    )}

                    {/* Images */}
                    {r.imageUrls && r.imageUrls.length > 0 && (
                      <div>
                        <span className="font-bold text-gray-500 block mb-1.5">Hình ảnh báo cáo:</span>
                        <div className="grid grid-cols-3 gap-2">
                          {r.imageUrls.map((url: string, index: number) => (
                            <a 
                              key={index} 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition-all flex items-center justify-center bg-gray-50 group"
                            >
                              <img src={url} alt={`Báo cáo ảnh ${index + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <ExternalLink className="w-4 h-4 text-white drop-shadow" />
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Expand / Collapse Button */}
                <button 
                  onClick={() => toggleExpand(r.id)}
                  className="w-full mt-3 pt-2.5 border-t border-gray-50 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors font-medium"
                >
                  {isExpanded ? (
                    <>
                      Thu gọn chi tiết <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Xem chi tiết báo cáo <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
