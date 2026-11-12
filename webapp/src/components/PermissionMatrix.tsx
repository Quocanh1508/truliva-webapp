import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePermission, type ResolvedPermission, type UserOverrideInfo } from '../context/PermissionContext';
import {
  Search, Shield, Check, X, RefreshCw, ChevronDown, ChevronRight, Info, Users, Building2, RotateCcw,
  Plus, Sparkles, UserPlus, User, Loader2, AlertCircle, Filter, CheckCheck, Lock
} from 'lucide-react';
import { removeVietnameseTones } from '../utils/text';
import type { SystemFeature } from '../config/permissions';

type Tab = 'roles' | 'groups' | 'users';
type Tone = 'emerald' | 'indigo';

/* ─────────────────────────── Ô bật/tắt ─────────────────────────── */
interface ToggleCellProps {
  resolved: ResolvedPermission;
  /** true nếu ô này đang bị ghi đè ở tầng đang xem (nhóm hoặc cá nhân) */
  isOverride: boolean;
  /** Tầng đang xem có khái niệm "kế thừa" không (tab Nhóm / Người) */
  showInheritance: boolean;
  pending: boolean;
  tone: Tone;
  title: string;
  onToggle: () => void;
  onClearOverride?: () => void;
  clearLabel?: string;
}

const ToggleCell: React.FC<ToggleCellProps> = ({
  resolved, isOverride, showInheritance, pending, tone, title, onToggle, onClearOverride, clearLabel
}) => {
  const locked = resolved.source === 'admin';
  const on = resolved.value;
  const solidOn = tone === 'indigo'
    ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
    : 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600';
  const softOn = tone === 'indigo'
    ? 'bg-indigo-50 border-indigo-200 text-indigo-500 hover:bg-indigo-100'
    : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100';

  let cls: string;
  if (locked) cls = 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-not-allowed opacity-80';
  else if (!showInheritance || isOverride) {
    cls = on
      ? `${solidOn} shadow-sm`
      : (isOverride
        ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100'
        : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 hover:text-gray-600');
    if (showInheritance && isOverride) cls += ` ring-2 ${on ? (tone === 'indigo' ? 'ring-indigo-200' : 'ring-emerald-200') : 'ring-red-200'}`;
  } else {
    // Đang kế thừa → kiểu nhạt, viền nét đứt
    cls = on ? `${softOn} border-dashed` : 'bg-white border-dashed border-gray-300 text-gray-300 hover:bg-gray-50 hover:text-gray-500';
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        title={title}
        className={`inline-flex items-center justify-center p-1.5 rounded-xl border transition-all active:scale-95 ${cls} ${pending ? 'opacity-60' : ''}`}
      >
        {locked ? <Lock className="h-4 w-4" /> : on ? <Check className="h-4 w-4 stroke-[3]" /> : <X className="h-4 w-4 stroke-[3]" />}
      </button>
      {showInheritance && !locked && (
        isOverride ? (
          <button
            type="button"
            onClick={onClearOverride}
            className="text-[9px] font-semibold text-amber-700 hover:text-red-600 flex items-center gap-0.5"
            title={clearLabel}
          >
            <RotateCcw className="h-2.5 w-2.5" /> Ghi đè
          </button>
        ) : (
          <span className="text-[9px] text-gray-400">Kế thừa</span>
        )
      )}
    </div>
  );
};

/* ─────────────────────────── Ma trận ─────────────────────────── */
export const PermissionMatrix: React.FC = () => {
  const {
    groupOverrideMatrix,
    userPermMatrix,
    usersWithOverrides,
    newFeatureKeys,
    groups,
    customGroupKeys,
    modules,
    features,
    roles,
    loading,
    resolveRole,
    resolveGroup,
    resolveUser,
    updatePermission,
    clearGroupOverride,
    resetGroupPermissions,
    updateUserPermission,
    clearUserOverride,
    resetUserPermissions,
    acknowledgeFeatures,
    searchUsersForPermissions,
    syncCatalog
  } = usePermission();

  const [activeTab, setActiveTab] = useState<Tab>('roles');
  const [selectedRoleForGroup, setSelectedRoleForGroup] = useState<string>('SALER');
  const [search, setSearch] = useState('');
  const [onlyNewRaw, setOnlyNew] = useState(false);
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroupInput, setShowAddGroupInput] = useState(false);
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserOverrideInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOverrideInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);
  const newKeySet = useMemo(() => new Set(newFeatureKeys), [newFeatureKeys]);
  const newFeatures = useMemo(() => features.filter(f => newKeySet.has(f.key)), [features, newKeySet]);

  // Khi đã duyệt hết tính năng mới → bộ lọc tự tắt
  const onlyNew = onlyNewRaw && newFeatureKeys.length > 0;

  useEffect(() => {
    if (!syncMessage) return;
    const t = setTimeout(() => setSyncMessage(null), 5000);
    return () => clearTimeout(t);
  }, [syncMessage]);

  const displayGroups = useMemo(
    () => Array.from(new Set([...groups, ...extraGroups])),
    [groups, extraGroups]
  );

  const userOverrides = useMemo(
    () => (selectedUser ? userPermMatrix[selectedUser.id] || {} : {}),
    [selectedUser, userPermMatrix]
  );
  const selectedUserOverrideCount = Object.keys(userOverrides).length;

  const hasOverrideInView = useCallback((featureKey: string): boolean => {
    if (activeTab === 'groups') {
      return displayGroups.some(g => groupOverrideMatrix[`${selectedRoleForGroup}::${g}`]?.[featureKey] !== undefined);
    }
    if (activeTab === 'users') return userOverrides[featureKey] !== undefined;
    return false;
  }, [activeTab, displayGroups, groupOverrideMatrix, selectedRoleForGroup, userOverrides]);

  const filteredFeatures = useMemo(() => {
    let list: SystemFeature[] = features;
    if (onlyNew) list = list.filter(f => newKeySet.has(f.key));
    if (onlyOverrides && activeTab !== 'roles') list = list.filter(f => hasOverrideInView(f.key));
    if (search.trim()) {
      const q = removeVietnameseTones(search.toLowerCase());
      list = list.filter(f =>
        removeVietnameseTones(f.name.toLowerCase()).includes(q) ||
        removeVietnameseTones(f.description.toLowerCase()).includes(q) ||
        f.key.toLowerCase().includes(q)
      );
    }
    return list;
  }, [features, search, onlyNew, newKeySet, onlyOverrides, activeTab, hasOverrideInView]);

  /** Chạy 1 thao tác cho 1 ô, đánh dấu pending mà không chặn các ô khác */
  const runCell = useCallback(async (cellKey: string, fn: () => Promise<unknown>) => {
    setPending(prev => new Set(prev).add(cellKey));
    try {
      await fn();
    } finally {
      setPending(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const report = await syncCatalog();
    setSyncing(false);
    if (report) {
      setSyncMessage(report.newlyRegistered.length
        ? `Đã phát hiện & khởi tạo quyền mặc định cho ${report.newlyRegistered.length} tính năng mới.`
        : `Danh mục đã đồng bộ (${report.catalogSize} tính năng). Không có tính năng mới.`);
    }
  };

  const handleFilterNew = () => {
    const next = !onlyNew;
    setOnlyNew(next);
    if (next) {
      setCollapsedModules({});
      setSearch('');
      requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const handleAcknowledgeAll = async () => {
    if (!window.confirm(
      `Xác nhận áp dụng quyền mặc định cho ${newFeatureKeys.length} tính năng mới và đánh dấu đã duyệt?\n\n` +
      'Quyền mặc định đã được hệ thống khởi tạo sẵn. Bạn vẫn có thể chỉnh từng ô sau này.'
    )) return;
    setAcknowledging(true);
    await acknowledgeFeatures();
    setAcknowledging(false);
  };

  const handleResetGroup = (role: string, group: string) => {
    if (!window.confirm(`Khôi phục TOÀN BỘ quyền của nhóm "${group}" về mặc định của chức danh "${role}"?`)) return;
    runCell(`reset:${role}::${group}`, () => resetGroupPermissions(role, group));
  };

  const handleResetUser = (u: UserOverrideInfo) => {
    if (!window.confirm(`Xóa toàn bộ quyền riêng của "${u.fullName}" và khôi phục về mặc định theo Chức danh/Nhóm?`)) return;
    runCell(`reset:user:${u.id}`, () => resetUserPermissions(u.id));
  };

  const handleUserSearch = useCallback(async (q: string) => {
    setUserSearchQuery(q);
    if (q.trim().length < 2) {
      setUserSearchResults([]);
      return;
    }
    setIsSearching(true);
    setUserSearchResults(await searchUsersForPermissions(q));
    setIsSearching(false);
  }, [searchUsersForPermissions]);

  const addGroup = () => {
    const g = newGroupName.trim();
    if (g && !displayGroups.includes(g)) setExtraGroups(prev => [...prev, g]);
    setNewGroupName('');
    setShowAddGroupInput(false);
  };

  const currentRoleObj = roles.find(r => r.key === selectedRoleForGroup) || roles[0];
  const roleLabel = (key: string) => roles.find(r => r.key === key)?.label || key;
  const colSpanCount = activeTab === 'roles' ? roles.length + 1 : activeTab === 'groups' ? displayGroups.length + 1 : 3;
  const groupOverrideCountForRole = customGroupKeys.filter(k => k.startsWith(`${selectedRoleForGroup}::`)).length;

  const tabBtn = (tab: Tab, color: string, icon: React.ReactNode, label: string, badge?: string) => (
    <button
      type="button"
      onClick={() => { setActiveTab(tab); setOnlyOverrides(false); }}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
        activeTab === tab ? `bg-white ${color} shadow-sm border border-gray-200/80` : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge && <span className="bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{badge}</span>}
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-5">
      {/* ── Banner tính năng mới ── */}
      {newFeatures.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/70 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-amber-100 rounded-lg shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-900 text-sm">
                Có {newFeatures.length} tính năng mới chưa được duyệt phân quyền
              </div>
              <div className="text-xs text-amber-700 mt-1">
                Hệ thống đã tự áp dụng <strong>quyền mặc định</strong> cho các tính năng này (Admin luôn có quyền).
                Bấm <strong>Lọc xem ngay</strong> để kiểm tra; chỉnh bất kỳ ô nào trên dòng đó cũng tự đánh dấu đã duyệt.
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {newFeatures.map(f => (
                  <span key={f.key} className="text-[10px] bg-white/80 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-medium" title={f.key}>
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-10">
            <button
              type="button"
              onClick={handleFilterNew}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                onlyNew ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {onlyNew ? 'Bỏ lọc' : `Lọc xem ngay (${newFeatures.length})`}
            </button>
            <button
              type="button"
              onClick={handleAcknowledgeAll}
              disabled={acknowledging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 disabled:opacity-60"
            >
              {acknowledging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Áp dụng quyền mặc định & Đánh dấu đã duyệt
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              Ma Trận Phân Quyền Động
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 font-semibold px-2 py-0.5 rounded-full">Dynamic 3-Tier</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Ưu tiên: <strong>Cá nhân</strong> → <strong>Nhóm</strong> → <strong>Chức danh</strong> → Mặc định hệ thống. {features.length} tính năng.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            onClick={handleSync}
            disabled={loading || syncing}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors"
            title="Quét tính năng mới trong hệ thống & làm mới ma trận (không ghi đè cấu hình cũ)"
          >
            <RefreshCw className={`h-4 w-4 ${loading || syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {syncMessage && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-2">{syncMessage}</div>
      )}

      {/* ── Tabs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/80 p-2 rounded-2xl border border-gray-200/70">
        <div className="flex items-center gap-2 flex-wrap">
          {tabBtn('roles', 'text-blue-700', <Users className="h-4 w-4" />, 'Theo Chức Danh', `${roles.length}`)}
          {tabBtn('groups', 'text-indigo-700', <Building2 className="h-4 w-4" />, 'Theo Nhóm', customGroupKeys.length ? `${customGroupKeys.length} tùy chỉnh` : undefined)}
          {tabBtn('users', 'text-emerald-700', <User className="h-4 w-4" />, 'Theo Người', usersWithOverrides.length ? `${usersWithOverrides.length} cá nhân` : undefined)}
        </div>

        {activeTab === 'groups' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Chức danh:</span>
            <select
              value={selectedRoleForGroup}
              onChange={(e) => setSelectedRoleForGroup(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              {roles.map(r => {
                const n = customGroupKeys.filter(k => k.startsWith(`${r.key}::`)).length;
                return <option key={r.key} value={r.key}>{r.label}{n ? ` • ${n} nhóm tùy chỉnh` : ''}</option>;
              })}
            </select>
            {showAddGroupInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setShowAddGroupInput(false); }}
                  placeholder="Tên nhóm mới..."
                  className="px-2.5 py-1 text-xs border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 w-32 bg-white"
                />
                <button type="button" onClick={addGroup} className="p-1 text-white bg-indigo-600 rounded-lg"><Check className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setShowAddGroupInput(false)} className="p-1 text-gray-500 bg-gray-200 rounded-lg"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddGroupInput(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm nhóm
              </button>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="flex items-center gap-2 flex-wrap relative">
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
              {userSearchResults.length > 0 && userSearchQuery.length >= 2 && (
                <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-72 max-h-56 overflow-auto">
                  {userSearchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelectedUser(u); setUserSearchQuery(''); setUserSearchResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center gap-2 border-b border-gray-100 last:border-0"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">{u.fullName}</div>
                        <div className="text-[10px] text-gray-500">{roleLabel(u.role)} • {u.group || 'Không nhóm'} • {u.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {usersWithOverrides.length > 0 && (
              <select
                value={selectedUser?.id || ''}
                onChange={(e) => setSelectedUser(usersWithOverrides.find(u => u.id === e.target.value) || null)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm max-w-[240px]"
              >
                <option value="">Người đã có quyền riêng ({usersWithOverrides.length})...</option>
                {usersWithOverrides.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({roleLabel(u.role)}) • {Object.keys(userPermMatrix[u.id] || {}).length} quyền riêng
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Ghi chú quy tắc + bộ lọc ── */}
      <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/60 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center gap-3 text-xs text-blue-900">
        <div className="flex items-start gap-3 flex-1">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            {activeTab === 'roles' && (
              <>Cấu hình tại đây là <strong>quyền gốc</strong> cho mọi tài khoản thuộc Chức danh. <strong>Admin</strong> luôn có toàn bộ quyền (ô <Lock className="inline h-3 w-3" />), trừ công cụ Dev.</>
            )}
            {activeTab === 'groups' && (
              <>Đang cấu hình nhóm của <strong>{currentRoleObj?.label}</strong>. Ô <strong>viền nét đứt</strong> = đang <strong>Kế thừa</strong> từ Chức danh; ô <strong>đậm có viền sáng</strong> = <strong>Ghi đè</strong> riêng (bấm "<RotateCcw className="inline h-3 w-3" /> Ghi đè" để khôi phục về theo Chức danh).</>
            )}
            {activeTab === 'users' && (
              <>Quyền cá nhân có <strong>ưu tiên cao nhất</strong>. Chỉ dùng cho ngoại lệ. Cột <strong>Nguồn</strong> cho biết quyền đang Kế thừa từ Nhóm/Chức danh hay bị Ghi đè riêng.</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {onlyNew && (
            <button type="button" onClick={() => setOnlyNew(false)} className="flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded-lg font-semibold">
              Đang lọc: tính năng mới <X className="h-3 w-3" />
            </button>
          )}
          {activeTab !== 'roles' && (
            <label className="flex items-center gap-1.5 font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={onlyOverrides} onChange={(e) => setOnlyOverrides(e.target.checked)} className="rounded" />
              Chỉ hiện quyền bị ghi đè
            </label>
          )}
        </div>
      </div>

      {/* ── Header người dùng đang chọn ── */}
      {activeTab === 'users' && selectedUser && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/70 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><User className="h-4 w-4 text-emerald-700" /></div>
            <div>
              <div className="font-bold text-emerald-900 text-sm">{selectedUser.fullName}</div>
              <div className="text-[11px] text-emerald-700">{roleLabel(selectedUser.role)} • {selectedUser.group || 'Không nhóm'} • {selectedUser.username}</div>
            </div>
            {selectedUserOverrideCount > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                {selectedUserOverrideCount} quyền ghi đè
              </span>
            )}
          </div>
          {selectedUserOverrideCount > 0 && (
            <button
              type="button"
              onClick={() => handleResetUser(selectedUser)}
              disabled={pending.has(`reset:user:${selectedUser.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Khôi phục tất cả về theo Role/Nhóm
            </button>
          )}
        </div>
      )}

      {activeTab === 'users' && !selectedUser && (
        <div className="text-center py-12 text-gray-500">
          <UserPlus className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <div className="text-sm font-semibold text-gray-600">Chưa chọn nhân viên</div>
          <div className="text-xs text-gray-400 mt-1">Tìm kiếm nhân viên hoặc chọn từ danh sách người đã có quyền riêng.</div>
        </div>
      )}

      {/* ── Bảng ma trận ── */}
      {(activeTab !== 'users' || selectedUser) && (
        <div ref={tableRef} className="overflow-auto max-h-[calc(100vh-220px)] border border-gray-200/80 rounded-2xl shadow-sm relative scroll-mt-4">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr className="bg-slate-50 border-b border-gray-200 text-xs">
                <th className="py-3.5 px-4 font-bold text-gray-700 min-w-[280px] sticky top-0 left-0 z-30 bg-slate-50 border-b border-gray-200">
                  Tính năng / Hành động hệ thống
                </th>

                {activeTab === 'roles' && roles.map(r => (
                  <th key={r.key} className="py-3.5 px-3 font-bold text-center min-w-[100px] bg-slate-50 border-b border-gray-200">
                    <span className={`inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${r.badgeColor}`}>{r.label}</span>
                  </th>
                ))}

                {activeTab === 'groups' && displayGroups.map(grp => {
                  const gk = `${selectedRoleForGroup}::${grp}`;
                  const count = Object.keys(groupOverrideMatrix[gk] || {}).length;
                  return (
                    <th key={grp} className="py-3.5 px-3 font-bold text-center min-w-[110px] bg-slate-50 border-b border-gray-200">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                          count ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-100 border-gray-200 text-gray-700'
                        }`}>{grp}</span>
                        {count ? (
                          <button
                            type="button"
                            onClick={() => handleResetGroup(selectedRoleForGroup, grp)}
                            disabled={pending.has(`reset:${gk}`)}
                            className="text-[10px] text-indigo-600 hover:text-red-600 font-semibold flex items-center gap-0.5"
                            title={`Khôi phục toàn bộ nhóm ${grp} về quyền của ${currentRoleObj?.label}`}
                          >
                            <Sparkles className="h-2.5 w-2.5" /> {count} ghi đè <RotateCcw className="h-2.5 w-2.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-normal">Kế thừa toàn bộ</span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {activeTab === 'users' && selectedUser && (
                  <>
                    <th className="py-3.5 px-3 font-bold text-center min-w-[130px] bg-slate-50 border-b border-gray-200">
                      <span className="inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">Quyền hiệu lực</span>
                    </th>
                    <th className="py-3.5 px-3 font-bold text-left min-w-[220px] bg-slate-50 border-b border-gray-200">
                      <span className="inline-block px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-gray-100 border-gray-200 text-gray-600">Nguồn</span>
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredFeatures.length === 0 && (
                <tr><td colSpan={colSpanCount} className="py-10 text-center text-gray-400">Không có tính năng nào khớp bộ lọc.</td></tr>
              )}
              {modules.map(mod => {
                const modFeatures = filteredFeatures.filter(f => f.module === mod.id);
                if (modFeatures.length === 0) return null;
                const isExpanded = !collapsedModules[mod.id];
                const modNewCount = modFeatures.filter(f => newKeySet.has(f.key)).length;

                return (
                  <React.Fragment key={mod.id}>
                    <tr
                      onClick={() => setCollapsedModules(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                      className="bg-gray-100/90 hover:bg-gray-200/80 cursor-pointer font-bold text-gray-800"
                    >
                      <td colSpan={colSpanCount} className="py-2.5 px-4 sticky left-0 z-10 bg-gray-100/95">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                          <span>{mod.name}</span>
                          <span className="text-[10px] bg-gray-200 text-gray-700 font-semibold px-2 py-0.5 rounded-full">{modFeatures.length} tính năng</span>
                          {modNewCount > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-200">{modNewCount} mới</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && modFeatures.map(feat => {
                      const isNew = newKeySet.has(feat.key);
                      return (
                        <tr key={feat.key} className={`hover:bg-blue-50/30 group ${isNew ? 'bg-amber-50/50' : ''}`}>
                          <td className={`py-3 px-4 align-middle sticky left-0 z-10 border-r border-gray-100 ${isNew ? 'bg-amber-50 border-l-4 border-l-amber-400' : 'bg-white group-hover:bg-blue-50/60'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-gray-900">{feat.name}</div>
                              {isNew && (
                                <>
                                  <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded-md shrink-0">MỚI</span>
                                  <button
                                    type="button"
                                    onClick={() => acknowledgeFeatures([feat.key])}
                                    className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-0.5"
                                    title="Giữ quyền mặc định hiện tại và đánh dấu đã duyệt"
                                  >
                                    <CheckCheck className="h-3 w-3" /> Duyệt
                                  </button>
                                </>
                              )}
                              {feat.devOnly && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded-md">DEV</span>}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{feat.description}</div>
                            <div className="text-[10px] font-mono text-gray-400 mt-0.5">{feat.key}</div>
                          </td>

                          {/* Tab Chức danh */}
                          {activeTab === 'roles' && roles.map(r => {
                            const resolved = resolveRole(r.key, feat.key);
                            const cellKey = `role:${r.key}:${feat.key}`;
                            return (
                              <td key={r.key} className="py-3 px-3 text-center align-middle">
                                <ToggleCell
                                  resolved={resolved}
                                  isOverride={false}
                                  showInheritance={false}
                                  pending={pending.has(cellKey)}
                                  tone="emerald"
                                  title={resolved.source === 'admin'
                                    ? 'Admin luôn có tất cả quyền hạn thông thường'
                                    : `${resolved.value ? 'Tắt' : 'Bật'} quyền "${feat.name}" cho ${r.label}`}
                                  onToggle={() => runCell(cellKey, () => updatePermission(r.key, feat.key, !resolved.value))}
                                />
                              </td>
                            );
                          })}

                          {/* Tab Nhóm */}
                          {activeTab === 'groups' && displayGroups.map(grp => {
                            const resolved = resolveGroup(selectedRoleForGroup, grp, feat.key);
                            const cellKey = `group:${selectedRoleForGroup}::${grp}:${feat.key}`;
                            return (
                              <td key={grp} className="py-3 px-3 text-center align-middle">
                                <ToggleCell
                                  resolved={resolved}
                                  isOverride={resolved.source === 'group'}
                                  showInheritance
                                  pending={pending.has(cellKey)}
                                  tone="indigo"
                                  title={resolved.source === 'admin'
                                    ? 'Admin luôn có tất cả quyền hạn thông thường'
                                    : resolved.source === 'group'
                                    ? `Ghi đè riêng nhóm ${grp}: ${resolved.value ? 'BẬT' : 'TẮT'} (Chức danh: ${resolved.inheritedValue ? 'BẬT' : 'TẮT'}). Bấm để đổi.`
                                    : `Kế thừa từ ${currentRoleObj?.label}: ${resolved.value ? 'BẬT' : 'TẮT'}. Bấm để ghi đè riêng cho nhóm ${grp}.`}
                                  onToggle={() => runCell(cellKey, () => updatePermission(selectedRoleForGroup, feat.key, !resolved.value, grp))}
                                  onClearOverride={() => runCell(cellKey, () => clearGroupOverride(selectedRoleForGroup, grp, feat.key))}
                                  clearLabel={`Khôi phục về theo ${currentRoleObj?.label} (${resolved.inheritedValue ? 'BẬT' : 'TẮT'})`}
                                />
                              </td>
                            );
                          })}

                          {/* Tab Người */}
                          {activeTab === 'users' && selectedUser && (() => {
                            const resolved = resolveUser(selectedUser, feat.key);
                            const cellKey = `user:${selectedUser.id}:${feat.key}`;
                            const isOverride = resolved.source === 'user';
                            const fromLabel = resolved.inheritedFrom === 'group'
                              ? `Nhóm ${selectedUser.group}`
                              : `Chức danh ${roleLabel(selectedUser.role)}`;
                            return (
                              <>
                                <td className="py-3 px-3 text-center align-middle">
                                  <ToggleCell
                                    resolved={resolved}
                                    isOverride={isOverride}
                                    showInheritance={false}
                                    pending={pending.has(cellKey)}
                                    tone="emerald"
                                    title={resolved.source === 'admin'
                                      ? 'Admin luôn có tất cả quyền hạn thông thường'
                                      : isOverride
                                      ? `Ghi đè riêng: ${resolved.value ? 'BẬT' : 'TẮT'}. Bấm để đổi.`
                                      : `Đang kế thừa từ ${fromLabel}: ${resolved.value ? 'BẬT' : 'TẮT'}. Bấm để ghi đè riêng.`}
                                    onToggle={() => runCell(cellKey, () => updateUserPermission(selectedUser.id, feat.key, !resolved.value, selectedUser))}
                                  />
                                </td>
                                <td className="py-3 px-3 align-middle">
                                  {resolved.source === 'admin' ? (
                                    <span className="text-[10px] text-gray-500 inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Admin luôn có quyền</span>
                                  ) : isOverride ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md">Ghi đè riêng</span>
                                      <span className="text-[10px] text-gray-500">
                                        ({fromLabel}: {resolved.inheritedValue ? 'Bật' : 'Tắt'})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => runCell(cellKey, () => clearUserOverride(selectedUser.id, feat.key))}
                                        className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
                                        title={`Bỏ ghi đè, dùng lại quyền của ${fromLabel}`}
                                      >
                                        <RotateCcw className="h-3 w-3" /> Khôi phục mặc định
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-gray-500">Kế thừa từ <strong>{fromLabel}</strong></span>
                                  )}
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

      {activeTab === 'groups' && groupOverrideCountForRole === 0 && (
        <div className="text-[11px] text-gray-400 text-center">Chức danh {currentRoleObj?.label} chưa có nhóm nào được ghi đè — mọi nhóm đang kế thừa quyền của Chức danh.</div>
      )}
    </div>
  );
};

export default PermissionMatrix;
