import React, { useEffect, useState } from 'react';
import { getStations, createMainStation, createTechStation, updateMainStation, updateTechStation } from '../../api/client';
import { Building, MapPin, Users, Plus, ChevronDown, ChevronRight, Edit2, Check, X, Lock, Unlock } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';

// Helper to sort tech stations: TP.Hồ Chí Minh, Hà Nội, Đà Nẵng first, then A-Z
function getSortedTechStations(main: any) {
  if (!main || !main.techStations) return [];
  const isTruliva = main.name?.toLowerCase() === 'truliva';
  return [...main.techStations].sort((a, b) => {
    if (isTruliva) {
      const getPriority = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('hồ chí minh') || n.includes('hcm')) return 1;
        if (n.includes('hà nội')) return 2;
        if (n.includes('đà nẵng')) return 3;
        return 999;
      };
      const pA = getPriority(a.name);
      const pB = getPriority(b.name);
      if (pA !== pB) return pA - pB;
    }
    return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  });
}

export default function StationManage() {
  const { confirm } = useConfirm();
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'locked'>('active');

  const [expandedMain, setExpandedMain] = useState<string[]>([]);
  
  // Forms
  const [newMainName, setNewMainName] = useState('');
  const [newTechName, setNewTechName] = useState('');
  const [activeMainIdForTech, setActiveMainIdForTech] = useState('');

  // Inline editing states
  const [editingMainId, setEditingMainId] = useState<string | null>(null);
  const [editMainNameValue, setEditMainNameValue] = useState('');
  const [editingTechId, setEditingTechId] = useState<string | null>(null);
  const [editTechNameValue, setEditTechNameValue] = useState('');

  const loadStations = async (status = statusFilter) => {
    try {
      setLoading(true);
      const data = await getStations(status);
      setStations(data);
      if (data.length > 0 && expandedMain.length === 0) {
        setExpandedMain([data[0].id]);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải danh sách trạm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
  }, []);

  const toggleMain = (id: string) => {
    setExpandedMain(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreateMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMainName.trim()) return;
    try {
      await createMainStation(newMainName);
      setNewMainName('');
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateTech = async (e: React.FormEvent, mainId: string) => {
    e.preventDefault();
    if (!newTechName.trim()) return;
    try {
      await createTechStation(newTechName, mainId);
      setNewTechName('');
      setActiveMainIdForTech('');
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStartEditMain = (id: string, name: string) => {
    setEditingMainId(id);
    setEditMainNameValue(name);
  };

  const handleSaveEditMain = async (id: string) => {
    if (!editMainNameValue.trim()) return;
    try {
      await updateMainStation(id, { name: editMainNameValue.trim() });
      setEditingMainId(null);
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStartEditTech = (id: string, name: string) => {
    setEditingTechId(id);
    setEditTechNameValue(name);
  };

  const handleSaveEditTech = async (id: string) => {
    if (!editTechNameValue.trim()) return;
    try {
      await updateTechStation(id, { name: editTechNameValue.trim() });
      setEditingTechId(null);
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleMainActive = async (id: string, currentActive: boolean) => {
    const isConfirmed = await confirm({
      title: currentActive ? 'Khóa trạm chính' : 'Mở khóa trạm chính',
      message: currentActive
        ? 'Bạn có chắc chắn muốn khóa trạm chính này? Các trạm kỹ thuật bên trong cũng sẽ không hoạt động.'
        : 'Bạn có chắc chắn muốn mở khóa trạm chính này?',
      confirmText: currentActive ? 'Khóa' : 'Mở khóa',
      cancelText: 'Hủy bỏ',
      type: 'warning'
    });

    if (!isConfirmed) return;

    try {
      await updateMainStation(id, { isActive: !currentActive });
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleTechActive = async (id: string, currentActive: boolean) => {
    const isConfirmed = await confirm({
      title: currentActive ? 'Khóa trạm kỹ thuật' : 'Mở khóa trạm kỹ thuật',
      message: currentActive
        ? 'Bạn có chắc chắn muốn khóa trạm kỹ thuật này?'
        : 'Bạn có chắc chắn muốn mở khóa trạm kỹ thuật này?',
      confirmText: currentActive ? 'Khóa' : 'Mở khóa',
      cancelText: 'Hủy bỏ',
      type: 'warning'
    });

    if (!isConfirmed) return;

    try {
      await updateTechStation(id, { isActive: !currentActive });
      loadStations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-80px)] font-sans">
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Quản lý Mạng lưới Trạm</h2>
          <p className="text-sm text-gray-500 mt-0.5">Trạm chính {'>'} Trạm kỹ thuật {'>'} Kỹ thuật viên</p>
        </div>
        
        {/* Dropdown Bộ lọc tình trạng */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Tình trạng:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as 'active' | 'locked';
              setStatusFilter(val);
              loadStations(val);
            }}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700 outline-none focus:ring-1 focus:ring-blue-500 font-medium cursor-pointer"
          >
            <option value="active">Hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/50 p-5">
        {error && <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg">{error}</div>}

        {/* Create Main Station (Only show when active status filter) */}
        {statusFilter === 'active' && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Thêm Trạm chính mới</label>
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Nhập tên trạm chính (VD: Trạm Hồ Chí Minh)"
                value={newMainName}
                onChange={(e) => setNewMainName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateMain(e)}
              />
            </div>
            <button 
              onClick={handleCreateMain}
              disabled={!newMainName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              <Plus size={16} /> Thêm Trạm chính
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : stations.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
            {statusFilter === 'active' 
              ? 'Chưa có trạm nào trong hệ thống. Hãy thêm trạm chính đầu tiên.' 
              : 'Không có trạm nào bị khóa.'}
          </div>
        ) : (
          <div className="space-y-4">
            {stations.map(main => {
              const isExpanded = expandedMain.includes(main.id);
              return (
                <div key={main.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-all duration-200">
                  {/* Main Station Header */}
                  <div 
                    className="group flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleMain(main.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </div>
                      
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Building size={20} className="text-blue-600 flex-shrink-0" />
                        {editingMainId === main.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editMainNameValue}
                              onChange={(e) => setEditMainNameValue(e.target.value)}
                              className="border border-blue-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-gray-800"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditMain(main.id);
                                if (e.key === 'Escape') setEditingMainId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveEditMain(main.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Lưu"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setEditingMainId(null)}
                              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                              title="Hủy"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 text-lg">{main.name}</span>
                            {!main.isActive && (
                              <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded border border-red-200 font-medium">
                                Đã khóa
                              </span>
                            )}
                            <button
                              onClick={() => handleStartEditMain(main.id, main.name)}
                              className="p-1 text-gray-400 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Sửa tên trạm chính"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        )}
                        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium ml-2">
                          {main.techStations?.length || 0} Trạm Kỹ thuật
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {main.isActive ? (
                        <button 
                          onClick={() => handleToggleMainActive(main.id, true)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Khóa trạm chính"
                        >
                          <Lock size={18} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleToggleMainActive(main.id, false)}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Mở khóa trạm chính"
                        >
                          <Unlock size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tech Stations (Expanded Content) */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4 pl-12 space-y-3">
                      
                      {/* Tech Station List */}
                      {getSortedTechStations(main).map((tech: any) => (
                        <div key={tech.id} className="bg-white border border-gray-200 p-3 rounded-md shadow-sm flex justify-between items-start group hover:border-blue-300 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MapPin size={16} className="text-emerald-600 flex-shrink-0" />
                              {editingTechId === tech.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editTechNameValue}
                                    onChange={(e) => setEditTechNameValue(e.target.value)}
                                    className="border border-blue-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-gray-800"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEditTech(tech.id);
                                      if (e.key === 'Escape') setEditingTechId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleSaveEditTech(tech.id)}
                                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                                    title="Lưu"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => setEditingTechId(null)}
                                    className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                    title="Hủy"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-800">{tech.name}</span>
                                  {!tech.isActive && (
                                    <span className="bg-red-50 text-red-600 text-[10px] px-1.5 py-0.5 rounded border border-red-200 font-medium">
                                      Đã khóa
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleStartEditTech(tech.id, tech.name)}
                                    className="p-1 text-gray-400 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Sửa tên trạm kỹ thuật"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-start gap-2 pl-6">
                              <Users size={14} className="text-gray-400 mt-0.5" />
                              <div className="text-sm text-gray-600">
                                {tech.users?.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {tech.users.map((u: any) => (
                                      <span key={u.id} className="bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5 rounded border border-blue-100">
                                        {u.fullName} {u.phoneNumber ? `(${u.phoneNumber})` : ''}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">Chưa có KTV nào thuộc trạm này. Gán KTV ở mục "Tài khoản".</span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {tech.isActive ? (
                              <button 
                                onClick={() => handleToggleTechActive(tech.id, true)}
                                className="p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                title="Khóa trạm kỹ thuật"
                              >
                                <Lock size={16} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleToggleTechActive(tech.id, false)}
                                className="p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                                title="Mở khóa trạm kỹ thuật"
                              >
                                <Unlock size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Add Tech Station Inline Form (Only show when active status filter) */}
                      {statusFilter === 'active' && (
                        activeMainIdForTech === main.id ? (
                          <form onSubmit={(e) => handleCreateTech(e, main.id)} className="flex items-center gap-2 mt-2 ml-6">
                            <input 
                              type="text"
                              autoFocus
                              placeholder="Tên trạm kỹ thuật mới..."
                              className="flex-1 max-w-sm border border-blue-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                              value={newTechName}
                              onChange={(e) => setNewTechName(e.target.value)}
                            />
                            <button type="submit" disabled={!newTechName.trim()} className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                              Lưu
                            </button>
                            <button type="button" onClick={() => {setActiveMainIdForTech(''); setNewTechName('');}} className="text-gray-500 hover:text-gray-700 px-2 text-sm">
                              Hủy
                            </button>
                          </form>
                        ) : (
                          <button 
                            onClick={() => setActiveMainIdForTech(main.id)}
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 ml-6 mt-2"
                          >
                            <Plus size={16} /> Thêm Trạm Kỹ thuật
                          </button>
                        )
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
