import React, { useState, useMemo, useCallback } from 'react';
import { usePermission } from '../context/PermissionContext';
import { Search, Shield, Check, X, RefreshCw, ChevronDown, ChevronRight, Info, Users, Building2, RotateCcw, Plus, Sparkles, UserPlus, User, Loader2, AlertCircle } from 'lucide-react';
import { getDefaultPermission } from '../config/permissions';
import { removeVietnameseTones } from '../utils/text';

export const PermissionMatrix: React.FC = () => {
  const {
    matrix,
    groupMatrix,
    userPermMatrix,
    usersWithOverrides,
    newFeatureKeys,
    groups,
    customGroupKeys,
    modules,
    features,
    roles,
    loading,
    updatePermission,
    resetGroupPermissions,
    updateUserPermission,
    resetUserPermissions,
    searchUsersForPermissions,
    refetchPermissions
  } = usePermission();

  const [activeTab, setActiveTab] = useState<'roles' | 'groups' | 'users'>('roles');
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

  // User tab state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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

  // Tìm info user đang được chọn
  const selectedUserInfo = useMemo(() => {
    if (!selectedUserId) return null;
    return usersWithOverrides.find(u => u.id === selectedUserId) ||
           userSearchResults.find(u => u.id === selectedUserId) || null;
  }, [selectedUserId, usersWithOverrides, userSearchResults]);

  // Số quyền riêng của user đang chọn
  const selectedUserOverrideCount = useMemo(() => {
    if (!selectedUserId || !userPermMatrix[selectedUserId]) return 0;
    return Object.keys(userPermMatrix[selectedUserId]).length;
  }, [selectedUserId, userPermMatrix]);

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

  const handleToggleUser = async (userId: string, featureKey: string, currentVal: boolean) => {
    const cellKey = `user:${userId}:${featureKey}`;
    setUpdatingKey(cellKey);
    await updateUserPermission(userId, featureKey, !currentVal);
    setUpdatingKey(null);
  };

  const handleResetUser = async (userId: string) => {
    const uInfo = selectedUserInfo;
    if (window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ quyền riêng của "${uInfo?.fullName || userId}" và khôi phục về mặc định theo Chức danh/Nhóm?`)) {
      setUpdatingKey(`reset:user:${userId}`);
      await resetUserPermissions(userId);
      setUpdatingKey(null);
    }
  };

  const handleUserSearch = useCallback(async (q: string) => {
    setUserSearchQuery(q);
    if (q.trim().length < 2) {
      setUserSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await searchUsersForPermissions(q);
    setUserSearchResults(results);
    setIsSearching(false);
  }, [searchUsersForPermissions]);

  const currentSelectedRoleObj = roles.find(r => r.key === selectedRoleForGroup) || roles[5]; // Default Saler

  // Hàm helper: kiểm tra feature có phải là tính năng mới chưa review không
  const isNewFeature = useCallback((featureKey: string) => {
    return newFeatureKeys.includes(featureKey);
  }, [newFeatureKeys]);

  // Tổng số tính năng mới
  const newFeaturesCount = newFeatureKeys.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-6">
      {/* New Features Alert Banner */}
      {newFeaturesCount > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/70 rounded-xl p-4 flex items-start gap-3">
          <div className="p-1.5 bg-amber-100 rounded-lg shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <div className="font-bold text-amber-900 text-sm">
              🆕 Có {newFeaturesCount} tính năng mới chưa được phân quyền!
            </div>
            <div className="text-xs text-amber-700 mt-1">
              Các tính năng mới đang sử dụng quyền mặc định. Vui lòng review và cấu hình phân quyền phù hợp.
            </div>
          </div>
        </div>
      )}

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
                  Dynamic 3-Tier
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Cấu hình bật/tắt tính năng theo <strong>Chức danh (Role)</strong>, <strong>Nhóm (Group)</strong>, hoặc <strong>Cá nhân (User)</strong>.
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

      {/* Navigation Tabs (Roles vs Groups vs Users) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/80 p-2 rounded-2xl border border-gray-200/70">
        <div className="flex items-center gap-2 flex-wrap">
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
            <span>Theo Chức Danh ({roles.length} Roles)</span>
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
            <span>Theo Nhóm</span>
            {customGroupKeys.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {customGroupKeys.length} tùy chỉnh
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'users'
                ? 'bg-white text-emerald-700 shadow-sm border border-gray-200/80'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
            }`}
          >
            <User className="h-4 w-4" />
            <span>Theo Người</span>
            {usersWithOverrides.length > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {usersWithOverrides.length} cá nhân
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

        {activeTab === 'users' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                placeholder="Tìm nhân viên..."
                className="pl-8 pr-3 py-1.5 text-xs border border-emerald-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 w-52 bg-white"
              />
              {isSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500 animate-spin" />}
            </div>
            {/* User search dropdown */}
            {userSearchResults.length > 0 && userSearchQuery.length >= 2 && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-72 max-h-48 overflow-auto">
                {userSearchResults.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setUserSearchQuery('');
                      setUserSearchResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center gap-2 border-b border-gray-100 last:border-0"
                  >
                    <UserPlus className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{u.fullName}</div>
                      <div className="text-[10px] text-gray-500">{u.role} • {u.group || 'Không nhóm'} • {u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Quick select existing users with overrides */}
            {usersWithOverrides.length > 0 && (
              <select
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(e.target.value || null)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm max-w-[200px]"
              >
                <option value="">Chọn người đã có cấu hình...</option>
                {usersWithOverrides.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
              </select>
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
              <span className="font-bold">Quy tắc phân quyền Chức danh:</span> Tài khoản <strong>ADMIN</strong> luôn có toàn bộ quyền hạn. Cấu hình tại đây sẽ là <strong>quyền mặc định</strong> cho tất cả tài khoản thuộc Role tương ứng (trừ khi nhóm hoặc cá nhân có cấu hình ghi đè riêng).
            </>
          ) : activeTab === 'groups' ? (
            <>
              <span className="font-bold">Quy tắc phân quyền theo Nhóm (Group Override):</span> Bạn đang cấu hình quyền riêng cho các nhóm thuộc chức vụ <strong>{currentSelectedRoleObj.label}</strong>. Các ô có dấu hiệu <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-100/80 px-1.5 py-0.2 rounded text-[10px]"><Sparkles className="h-3 w-3" /> Tùy chỉnh</span> sẽ ghi đè quyền của Role; các nhóm chưa tùy chỉnh sẽ tự động kế thừa quyền của Role.
            </>
          ) : (
            <>
              <span className="font-bold">Quy tắc phân quyền cấp Cá nhân (User Override):</span> Quyền cấp cá nhân có <strong>ưu tiên cao nhất</strong>, ghi đè quyền từ Nhóm và Chức danh. Chỉ cấu hình cho các trường hợp ngoại lệ cần xử lý riêng.
              {selectedUserInfo && (
                <span className="ml-1 font-semibold text-emerald-700">
                  Đang cấu hình cho: {selectedUserInfo.fullName} ({selectedUserInfo.role}{selectedUserInfo.group ? ` / ${selectedUserInfo.group}` : ''})
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* User Tab: Selected User Header */}
      {activeTab === 'users' && selectedUserId && selectedUserInfo && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/70 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <User className="h-4 w-4 text-emerald-700" />
            </div>
            <div>
              <div className="font-bold text-emerald-900 text-sm">{selectedUserInfo.fullName}</div>
              <div className="text-[11px] text-emerald-700">{selectedUserInfo.role} • {selectedUserInfo.group || 'Không nhóm'} • {selectedUserInfo.username}</div>
            </div>
            {selectedUserOverrideCount > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                {selectedUserOverrideCount} quyền riêng
              </span>
            )}
          </div>
          {selectedUserOverrideCount > 0 && (
            <button
              type="button"
              onClick={() => handleResetUser(selectedUserId)}
              disabled={updatingKey === `reset:user:${selectedUserId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${updatingKey === `reset:user:${selectedUserId}` ? 'animate-spin' : ''}`} />
              Xóa tất cả quyền riêng
            </button>
          )}
        </div>
      )}

      {/* User Tab: No user selected */}
      {activeTab === 'users' && !selectedUserId && (
        <div className="text-center py-12 text-gray-500">
          <UserPlus className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <div className="text-sm font-semibold text-gray-600">Chưa chọn nhân viên</div>
          <div className="text-xs text-gray-400 mt-1">Tìm kiếm nhân viên ở thanh bên trên hoặc chọn từ danh sách có sẵn để cấu hình quyền riêng.</div>
        </div>
      )}

      {/* Permission Matrix Table */}
      {(activeTab !== 'users' || selectedUserId) && (
        <div className="overflow-auto max-h-[calc(100vh-220px)] border border-gray-200/80 rounded-2xl shadow-sm relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs bg-slate-50">
              <tr className="bg-slate-50 border-b border-gray-200 text-xs">
                <th className="py-3.5 px-4 font-bold text-gray-700 min-w-[280px] sticky top-0 left-0 z-30 bg-slate-50 border-b border-gray-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                  Tính năng / Hành động hệ thống
                </th>

                {/* TAB 1: ROLES COLUMNS */}
                {activeTab === 'roles' && roles.map(r => (
                  <th key={r.key} className="py-3.5 px-3 font-bold text-center min-w-[110px] sticky top-0 z-20 bg-slate-50 border-b border-gray-200">
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
                    <th key={grp} className="py-3.5 px-3 font-bold text-center min-w-[120px] sticky top-0 z-20 bg-slate-50 border-b border-gray-200">
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

                {/* TAB 3: USER COLUMN (single user) */}
                {activeTab === 'users' && selectedUserId && (
                  <th className="py-3.5 px-3 font-bold text-center min-w-[140px] sticky top-0 z-20 bg-slate-50 border-b border-gray-200">
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">
                        Quyền riêng
                      </span>
                      <span className="text-[10px] text-gray-400">Override cá nhân</span>
                    </div>
                  </th>
                )}
                {activeTab === 'users' && selectedUserId && (
                  <th className="py-3.5 px-3 font-bold text-center min-w-[120px] sticky top-0 z-20 bg-slate-50 border-b border-gray-200">
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-gray-100 border-gray-200 text-gray-500">
                        Quyền kế thừa
                      </span>
                      <span className="text-[10px] text-gray-400">Từ Role/Group</span>
                    </div>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 text-xs">
              {modules.map(mod => {
                const modFeatures = filteredFeatures.filter(f => f.module === mod.id);
                if (modFeatures.length === 0) return null;
                const isExpanded = expandedModules[mod.id] !== false;
                const colSpanCount = activeTab === 'roles' ? roles.length + 1 : activeTab === 'groups' ? displayGroups.length + 1 : 3;
                const modNewCount = modFeatures.filter(f => isNewFeature(f.key)).length;

                return (
                  <React.Fragment key={mod.id}>
                    {/* Module Header Row */}
                    <tr 
                      onClick={() => toggleModule(mod.id)}
                      className="bg-gray-100/90 hover:bg-gray-200/80 cursor-pointer font-bold text-gray-800 transition-colors"
                    >
                      <td colSpan={colSpanCount} className="py-2.5 px-4 sticky left-0 z-10 bg-gray-100/95">
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
                          {modNewCount > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                              🆕 {modNewCount} mới
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Feature Rows */}
                    {isExpanded && modFeatures.map(feat => {
                      const isNew = isNewFeature(feat.key);

                      return (
                        <tr key={feat.key} className={`hover:bg-blue-50/30 transition-colors group ${isNew ? 'bg-amber-50/40' : ''}`}>
                          <td className={`py-3 px-4 align-middle sticky left-0 z-10 bg-white group-hover:bg-blue-50/60 border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)] ${isNew ? '!bg-amber-50/60 group-hover:!bg-amber-100/60' : ''}`}>
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-gray-900">{feat.name}</div>
                              {isNew && (
                                <span className="text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-md border border-amber-200 shrink-0">
                                  🆕 MỚI
                                </span>
                              )}
                            </div>
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

                          {/* TAB 3: RENDER USER CELLS */}
                          {activeTab === 'users' && selectedUserId && (() => {
                            const hasUserOverride = userPermMatrix[selectedUserId] && userPermMatrix[selectedUserId][feat.key] !== undefined;
                            const userOverrideValue = hasUserOverride ? userPermMatrix[selectedUserId][feat.key] : null;

                            // Tính quyền kế thừa từ Role/Group (không tính user override)
                            const inheritedRole = selectedUserInfo?.role || '';
                            const inheritedGroup = selectedUserInfo?.group?.trim() || '';
                            const groupKey = `${inheritedRole}::${inheritedGroup}`;
                            let inheritedValue: boolean;
                            if (inheritedGroup && groupMatrix[groupKey] && groupMatrix[groupKey][feat.key] !== undefined) {
                              inheritedValue = groupMatrix[groupKey][feat.key];
                            } else if (matrix[inheritedRole] && matrix[inheritedRole][feat.key] !== undefined) {
                              inheritedValue = matrix[inheritedRole][feat.key];
                            } else {
                              inheritedValue = getDefaultPermission(inheritedRole, feat.key);
                            }

                            const effectiveValue = hasUserOverride ? userOverrideValue! : inheritedValue;
                            const isUpdating = updatingKey === `user:${selectedUserId}:${feat.key}`;

                            return (
                              <>
                                {/* User Override Toggle */}
                                <td className="py-3 px-3 text-center align-middle">
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => handleToggleUser(selectedUserId, feat.key, effectiveValue)}
                                    className={`inline-flex items-center justify-center p-1.5 rounded-xl border transition-all ${
                                      hasUserOverride
                                        ? userOverrideValue
                                          ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm hover:bg-emerald-600 active:scale-95 ring-2 ring-emerald-200'
                                          : 'bg-red-100 border-red-300 text-red-500 hover:bg-red-200 hover:text-red-600 active:scale-95 ring-2 ring-red-200'
                                        : effectiveValue
                                        ? 'bg-emerald-500/60 border-emerald-400 text-white shadow-sm hover:bg-emerald-600 active:scale-95'
                                        : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:scale-95'
                                    }`}
                                    title={
                                      hasUserOverride
                                        ? `Quyền riêng: ${userOverrideValue ? 'BẬT' : 'TẮT'}. Bấm để đổi.`
                                        : `Đang kế thừa: ${effectiveValue ? 'BẬT' : 'TẮT'}. Bấm để tạo override.`
                                    }
                                  >
                                    {isUpdating ? (
                                      <RefreshCw className="h-4 w-4 animate-spin text-gray-600" />
                                    ) : effectiveValue ? (
                                      <Check className="h-4 w-4 stroke-[3]" />
                                    ) : (
                                      <X className="h-4 w-4 stroke-[3]" />
                                    )}
                                  </button>
                                  {hasUserOverride && (
                                    <div className="text-[9px] text-emerald-600 font-semibold mt-0.5 flex items-center justify-center gap-0.5">
                                      <Sparkles className="h-2.5 w-2.5" /> Riêng
                                    </div>
                                  )}
                                </td>
                                {/* Inherited Value (read-only) */}
                                <td className="py-3 px-3 text-center align-middle">
                                  <div className={`inline-flex items-center justify-center p-1.5 rounded-xl border ${
                                    inheritedValue
                                      ? 'bg-gray-100 border-gray-200 text-emerald-500'
                                      : 'bg-gray-50 border-gray-200 text-gray-300'
                                  }`}>
                                    {inheritedValue ? (
                                      <Check className="h-3.5 w-3.5 stroke-[2]" />
                                    ) : (
                                      <X className="h-3.5 w-3.5 stroke-[2]" />
                                    )}
                                  </div>
                                  <div className="text-[9px] text-gray-400 mt-0.5">
                                    {inheritedRole}{inheritedGroup ? `/${inheritedGroup}` : ''}
                                  </div>
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PermissionMatrix;
