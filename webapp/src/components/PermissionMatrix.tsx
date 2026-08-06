import React, { useState, useMemo } from 'react';
import { usePermission } from '../context/PermissionContext';
import { Search, Shield, Check, X, RefreshCw, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { getDefaultPermission } from '../config/permissions';
import { removeVietnameseTones } from '../utils/text';

export const PermissionMatrix: React.FC = () => {
  const { matrix, modules, features, roles, loading, updatePermission, refetchPermissions } = usePermission();
  const [search, setSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    orders: true,
    serials: true,
    reports: true,
    salaries: true,
    inventory: true,
    system: true
  });
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const toggleModule = (modId: string) => {
    setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  const filteredFeatures = useMemo(() => {
    if (!search || !search.trim()) return features;
    const cleanQ = removeVietnameseTones(search.toLowerCase());
    return features.filter(f => 
      removeVietnameseTones(f.name.toLowerCase()).includes(cleanQ) ||
      removeVietnameseTones(f.description.toLowerCase()).includes(cleanQ) ||
      f.key.toLowerCase().includes(cleanQ)
    );
  }, [features, search]);

  const handleToggle = async (role: string, featureKey: string, currentVal: boolean) => {
    if (role === 'ADMIN') return; // Admin luôn có tất cả quyền
    const cellKey = `${role}:${featureKey}`;
    setUpdatingKey(cellKey);
    await updatePermission(role, featureKey, !currentVal);
    setUpdatingKey(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Shield className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Ma Trận Phân Quyền Động (Dynamic Permission Matrix)</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Chủ động bật/tắt quyền hạn sử dụng các tính năng cho từng Chức danh (Role) trong hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm tính năng..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 w-64 bg-gray-50/50"
            />
          </div>

          <button
            onClick={() => refetchPermissions()}
            disabled={loading}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors"
            title="Làm mới ma trận phân quyền"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alert Note */}
      <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-800">
        <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Lưu ý phân quyền:</span> Tài khoản <strong>ADMIN</strong> luôn có toàn bộ quyền hạn. Thay đổi phân quyền ở đây sẽ áp dụng ngay lập tức đối với người dùng thuộc các Role tương ứng. Các tính năng mới khi Dev khai báo trong hệ thống sẽ tự động xuất hiện tại ma trận này.
        </div>
      </div>

      {/* Permission Matrix Table */}
      <div className="overflow-x-auto border border-gray-200/80 rounded-2xl shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200/80 text-xs">
              <th className="py-3.5 px-4 font-bold text-gray-700 min-w-[280px]">
                Tính năng / Hành động hệ thống
              </th>
              {roles.map(r => (
                <th key={r.key} className="py-3.5 px-3 font-bold text-center min-w-[110px]">
                  <span className={`inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${r.badgeColor}`}>
                    {r.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 text-xs">
            {modules.map(mod => {
              const modFeatures = filteredFeatures.filter(f => f.module === mod.id);
              if (modFeatures.length === 0) return null;
              const isExpanded = expandedModules[mod.id] !== false;

              return (
                <React.Fragment key={mod.id}>
                  {/* Module Header Row */}
                  <tr 
                    onClick={() => toggleModule(mod.id)}
                    className="bg-gray-100/70 hover:bg-gray-100 cursor-pointer font-bold text-gray-800 transition-colors"
                  >
                    <td colSpan={roles.length + 1} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                        <span>{mod.name}</span>
                        <span className="text-[10px] bg-gray-200 text-gray-700 font-semibold px-2 py-0.5 rounded-full">
                          {modFeatures.length} tính năng
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Feature Rows */}
                  {isExpanded && modFeatures.map(feat => (
                    <tr key={feat.key} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4 align-middle">
                        <div className="font-semibold text-gray-900">{feat.name}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{feat.description}</div>
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">Key: {feat.key}</div>
                      </td>

                      {roles.map(r => {
                        const isAllowed = (matrix[r.key] && matrix[r.key][feat.key] !== undefined)
                          ? matrix[r.key][feat.key]
                          : getDefaultPermission(r.key, feat.key);
                        const isUpdating = updatingKey === `${r.key}:${feat.key}`;
                        const isAdminRole = r.key === 'ADMIN';

                        return (
                          <td key={r.key} className="py-3 px-3 text-center align-middle">
                            <button
                              type="button"
                              disabled={isAdminRole || isUpdating}
                              onClick={() => handleToggle(r.key, feat.key, isAllowed)}
                              className={`inline-flex items-center justify-center p-1.5 rounded-xl border transition-all ${
                                isAdminRole
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-not-allowed opacity-80'
                                  : isAllowed
                                  ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm hover:bg-emerald-600 active:scale-95'
                                  : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:scale-95'
                              }`}
                              title={
                                isAdminRole
                                  ? 'Admin luôn có tất cả quyền hạn'
                                  : isAllowed
                                  ? `Bấm để tắt quyền ${feat.name} của ${r.label}`
                                  : `Bấm để bật quyền ${feat.name} cho ${r.label}`
                              }
                            >
                              {isUpdating ? (
                                <RefreshCw className="h-4 w-4 animate-spin text-gray-600" />
                              ) : isAllowed ? (
                                <Check className="h-4 w-4 stroke-[3]" />
                              ) : (
                                <X className="h-4 w-4 stroke-[3]" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PermissionMatrix;
