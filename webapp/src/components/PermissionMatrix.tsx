import React, { useState, useMemo } from 'react';
import { usePermission } from '../context/PermissionContext';
import { Search, Shield, Check, X, RefreshCw, ChevronDown, ChevronRight, Info, Users, Building2, RotateCcw, Plus, Sparkles } from 'lucide-react';
import { getDefaultPermission } from '../config/permissions';
import { removeVietnameseTones } from '../utils/text';

export const PermissionMatrix: React.FC = () => {
  const {
    matrix,
    groupMatrix,
    groups,
    customGroupKeys,
    modules,
    features,
    roles,
    loading,
    updatePermission,
    resetGroupPermissions,
    refetchPermissions
  } = usePermission();

  const [activeTab, setActiveTab] = useState<'roles' | 'groups'>('roles');
  const [selectedRoleForGroup, setSelectedRoleForGroup] = useState<string>('SALER');
  const [search, setSearch] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroupInput, setShowAddGroupInput] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    orders: true,
    hotline: true,
    serials: true,
    reports: true,
    salaries: true,
    inventory: true,
    system: true,
    dev_tools: true
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

  // Danh sách groups hiển thị (bao gồm cả group mới nếu vừa thêm tạm thời)
  const displayGroups = useMemo(() => {
    const list = [...groups];
    if (newGroupName.trim() && !list.includes(newGroupName.trim())) {
      list.push(newGroupName.trim());
    }
    return list;
  }, [groups, newGroupName]);

  const handleToggleRole = async (role: string, featureKey: string, currentVal: boolean) => {
    const feat = features.find(f => f.key === featureKey);
    if (role === 'ADMIN' && !feat?.devOnly) return; // Admin luôn có tất cả quyền thông thường
    const cellKey = `role:${role}:${featureKey}`;
    setUpdatingKey(cellKey);
    await updatePermission(role, featureKey, !currentVal);
    setUpdatingKey(null);
  };

  const handleToggleGroup = async (role: string, group: string, featureKey: string, currentVal: boolean) => {
    const feat = features.find(f => f.key === featureKey);
    if (role === 'ADMIN' && !feat?.devOnly) return;
    const cellKey = `group:${role}::${group}:${featureKey}`;
    setUpdatingKey(cellKey);
    await updatePermission(role, featureKey, !currentVal, group);
    setUpdatingKey(null);
  };

  const handleResetGroup = async (role: string, group: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn khôi phục toàn bộ quyền của nhóm "${group}" về mặc định của chức vụ "${role}" không?`)) {
      setUpdatingKey(`reset:${role}::${group}`);
      await resetGroupPermissions(role, group);
      setUpdatingKey(null);
    }
  };

  const currentSelectedRoleObj = roles.find(r => r.key === selectedRoleForGroup) || roles[5]; // Default Saler

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Ma Trận Phân Quyền Động
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 font-semibold px-2 py-0.5 rounded-full">
                  Dynamic 2-Tier
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Chủ động cấu hình bật/tắt tính năng theo <strong>Chức danh (Role)</strong> và tùy biến chi tiết theo từng <strong>Nhóm / Phòng ban (Group)</strong>.
              </p>
            </div>
          </div>
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

      {/* Navigation Tabs (Roles vs Groups) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/80 p-2 rounded-2xl border border-gray-200/70">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'roles'
                ? 'bg-white text-blue-700 shadow-sm border border-gray-200/80'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Phân Quyền Theo Chức Danh ({roles.length} Roles)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'groups'
                ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Phân Quyền Theo Nhóm / Kênh Bán Hàng</span>
            {customGroupKeys.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {customGroupKeys.length} nhóm tùy chỉnh
              </span>
            )}
          </button>
        </div>

        {activeTab === 'groups' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Chọn Chức danh:</span>
            <select
              value={selectedRoleForGroup}
              onChange={(e) => setSelectedRoleForGroup(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              {roles.map(r => (
                <option key={r.key} value={r.key}>
                  {r.label} ({r.key})
                </option>
              ))}
            </select>

            {showAddGroupInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Tên nhóm mới..."
                  className="px-2.5 py-1 text-xs border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 w-32 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGroupName.trim()) {
                      setShowAddGroupInput(false);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAddGroupInput(false)}
                  className="p-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-200 rounded-lg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddGroupInput(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
                title="Thêm nhóm mới vào bảng ma trận"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm nhóm</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Alert Note */}
      <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/60 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-900">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          {activeTab === 'roles' ? (
            <>
              <span className="font-bold">Quy tắc phân quyền Chức danh:</span> Tài khoản <strong>ADMIN</strong> luôn có toàn bộ quyền hạn. Cấu hình tại đây sẽ là <strong>quyền mặc định</strong> cho tất cả tài khoản thuộc Role tương ứng (trừ khi nhóm của họ có cấu hình ghi đè riêng).
            </>
          ) : (
            <>
              <span className="font-bold">Quy tắc phân quyền theo Nhóm (Group Override):</span> Bạn đang cấu hình quyền riêng cho các nhóm thuộc chức vụ <strong>{currentSelectedRoleObj.label}</strong>. Các ô có dấu hiệu <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-100/80 px-1.5 py-0.2 rounded text-[10px]"><Sparkles className="h-3 w-3" /> Tùy chỉnh</span> sẽ ghi đè quyền của Role; các nhóm chưa tùy chỉnh sẽ tự động kế thừa quyền của Role.
            </>
          )}
        </div>
      </div>

      {/* Permission Matrix Table */}
      <div className="overflow-x-auto border border-gray-200/80 rounded-2xl shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/90 border-b border-gray-200/80 text-xs">
              <th className="py-3.5 px-4 font-bold text-gray-700 min-w-[280px]">
                Tính năng / Hành động hệ thống
              </th>

              {/* TAB 1: ROLES COLUMNS */}
              {activeTab === 'roles' && roles.map(r => (
                <th key={r.key} className="py-3.5 px-3 font-bold text-center min-w-[110px]">
                  <span className={`inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${r.badgeColor}`}>
                    {r.label}
                  </span>
                </th>
              ))}

              {/* TAB 2: GROUPS COLUMNS */}
              {activeTab === 'groups' && displayGroups.map(grp => {
                const groupKey = `${selectedRoleForGroup}::${grp}`;
                const hasCustom = customGroupKeys.includes(groupKey);
                const isResetting = updatingKey === `reset:${groupKey}`;

                return (
                  <th key={grp} className="py-3.5 px-3 font-bold text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                        hasCustom
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                          : 'bg-gray-100 border-gray-200 text-gray-700'
                      }`}>
                        {grp}
                      </span>
                      {hasCustom ? (
                        <div className="flex items-center gap-1 text-[10px] text-indigo-600">
                          <span className="font-semibold flex items-center gap-0.5">
                            <Sparkles className="h-2.5 w-2.5" /> Riêng
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResetGroup(selectedRoleForGroup, grp)}
                            disabled={isResetting}
                            className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                            title={`Khôi phục nhóm ${grp} về quyền mặc định của ${currentSelectedRoleObj.label}`}
                          >
                            <RotateCcw className={`h-3 w-3 ${isResetting ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-normal">
                          Kế thừa
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 text-xs">
            {modules.map(mod => {
              const modFeatures = filteredFeatures.filter(f => f.module === mod.id);
              if (modFeatures.length === 0) return null;
              const isExpanded = expandedModules[mod.id] !== false;
              const colSpanCount = activeTab === 'roles' ? roles.length + 1 : displayGroups.length + 1;

              return (
                <React.Fragment key={mod.id}>
                  {/* Module Header Row */}
                  <tr 
                    onClick={() => toggleModule(mod.id)}
                    className="bg-gray-100/70 hover:bg-gray-100 cursor-pointer font-bold text-gray-800 transition-colors"
                  >
                    <td colSpan={colSpanCount} className="py-2.5 px-4">
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

                      {/* TAB 1: RENDER ROLE CELLS */}
                      {activeTab === 'roles' && roles.map(r => {
                        const isAllowed = (matrix[r.key] && matrix[r.key][feat.key] !== undefined)
                          ? matrix[r.key][feat.key]
                          : getDefaultPermission(r.key, feat.key);
                        const isUpdating = updatingKey === `role:${r.key}:${feat.key}`;
                        const isAdminRole = r.key === 'ADMIN';
                        const isLockedAdmin = isAdminRole && !feat.devOnly;

                        return (
                          <td key={r.key} className="py-3 px-3 text-center align-middle">
                            <button
                              type="button"
                              disabled={isLockedAdmin || isUpdating}
                              onClick={() => handleToggleRole(r.key, feat.key, isAllowed)}
                              className={`inline-flex items-center justify-center p-1.5 rounded-xl border transition-all ${
                                isLockedAdmin
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-not-allowed opacity-80'
                                  : isAllowed
                                  ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm hover:bg-emerald-600 active:scale-95'
                                  : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:scale-95'
                              }`}
                              title={
                                isLockedAdmin
                                  ? 'Admin luôn có tất cả quyền hạn thông thường'
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

                      {/* TAB 2: RENDER GROUP CELLS */}
                      {activeTab === 'groups' && displayGroups.map(grp => {
                        const groupKey = `${selectedRoleForGroup}::${grp}`;
                        const isAllowed = (groupMatrix[groupKey] && groupMatrix[groupKey][feat.key] !== undefined)
                          ? groupMatrix[groupKey][feat.key]
                          : (matrix[selectedRoleForGroup] && matrix[selectedRoleForGroup][feat.key] !== undefined)
                          ? matrix[selectedRoleForGroup][feat.key]
                          : getDefaultPermission(selectedRoleForGroup, feat.key);

                        const isUpdating = updatingKey === `group:${groupKey}:${feat.key}`;
                        const isAdminRole = selectedRoleForGroup === 'ADMIN';
                        const isLockedAdmin = isAdminRole && !feat.devOnly;

                        return (
                          <td key={grp} className="py-3 px-3 text-center align-middle">
                            <button
                              type="button"
                              disabled={isLockedAdmin || isUpdating}
                              onClick={() => handleToggleGroup(selectedRoleForGroup, grp, feat.key, isAllowed)}
                              className={`inline-flex items-center justify-center p-1.5 rounded-xl border transition-all ${
                                isLockedAdmin
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-not-allowed opacity-80'
                                  : isAllowed
                                  ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm hover:bg-indigo-700 active:scale-95'
                                  : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:scale-95'
                              }`}
                              title={
                                isLockedAdmin
                                  ? 'Admin luôn có tất cả quyền hạn thông thường'
                                  : isAllowed
                                  ? `Bấm để tắt quyền ${feat.name} của ${selectedRoleForGroup} nhóm ${grp}`
                                  : `Bấm để bật quyền ${feat.name} cho ${selectedRoleForGroup} nhóm ${grp}`
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
