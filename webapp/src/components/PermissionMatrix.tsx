import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePermission, type UserOverrideInfo } from '../context/PermissionContext';
import {
  Search, Shield, Check, X, RefreshCw, ChevronDown, ChevronRight, Users, Building2, RotateCcw,
  Plus, UserPlus, User, Loader2, AlertCircle, Filter, CheckCheck, BookOpen, Sparkles,
  ChevronsDownUp, ChevronsUpDown, HelpCircle, Layers, CheckCircle2
} from 'lucide-react';
import { removeVietnameseTones } from '../utils/text';
import type { SystemFeature } from '../config/permissions';
import { ToggleCell, PermissionLegend } from './permissions/ToggleCell';
import { ConfirmDialog, type ConfirmOptions } from './permissions/ConfirmDialog';
import { PermissionGuide, type GuideSectionId } from './permissions/PermissionGuide';

type Tab = 'roles' | 'groups' | 'users';

const GUIDE_SEEN_KEY = 'truliva.permissionGuide.seen';
const readGuideSeen = (): boolean => {
  try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return true; }
};
const writeGuideSeen = () => {
  try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* ignore */ }
};

const TIER_TABS: { id: Tab; tier: string; title: string; desc: string; icon: React.ReactNode; guide: GuideSectionId }[] = [
  { id: 'roles', tier: 'Tầng gốc', title: 'Theo Chức danh', desc: 'Quyền chung cho mọi tài khoản cùng chức danh', icon: <Users className="h-4 w-4" />, guide: 'roles' },
  { id: 'groups', tier: 'Ghi đè tầng 2', title: 'Theo Nhóm', desc: 'Khác biệt theo phòng ban / khu vực', icon: <Building2 className="h-4 w-4" />, guide: 'groups' },
  { id: 'users', tier: 'Ghi đè tầng 1 • ưu tiên cao nhất', title: 'Theo Người', desc: 'Ngoại lệ cho từng cá nhân', icon: <User className="h-4 w-4" />, guide: 'users' }
];

export const PermissionMatrix: React.FC = () => {
  const {
    groupOverrideMatrix, userPermMatrix, usersWithOverrides, newFeatureKeys, groups, customGroupKeys,
    modules, features, roles, loading,
    resolveRole, resolveGroup, resolveUser,
    updatePermission, clearGroupOverride, resetGroupPermissions,
    updateUserPermission, clearUserOverride, resetUserPermissions,
    acknowledgeFeatures, searchUsersForPermissions, syncCatalog
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
  const [toast, setToast] = useState<{ tone: 'ok' | 'info'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSectionId>('overview');
  const [guideSeen, setGuideSeen] = useState<boolean>(readGuideSeen);

  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { onConfirm: () => void }) | null>(null);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserOverrideInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOverrideInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);
  const newKeySet = useMemo(() => new Set(newFeatureKeys), [newFeatureKeys]);
  const newFeatures = useMemo(() => features.filter(f => newKeySet.has(f.key)), [features, newKeySet]);
  const onlyNew = onlyNewRaw && newFeatureKeys.length > 0;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const openGuide = useCallback((section: GuideSectionId = 'overview') => {
    setGuideSection(section);
    setGuideOpen(true);
    setGuideSeen(true);
    writeGuideSeen();
  }, []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  const askConfirm = (opts: ConfirmOptions, onConfirm: () => void) => setConfirmState({ ...opts, onConfirm });
  const closeConfirm = useCallback(() => setConfirmState(null), []);

  const displayGroups = useMemo(() => Array.from(new Set([...groups, ...extraGroups])), [groups, extraGroups]);
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
      setToast(report.newlyRegistered.length
        ? { tone: 'info', text: `Đã phát hiện ${report.newlyRegistered.length} tính năng mới và áp dụng quyền mặc định.` }
        : { tone: 'ok', text: `Đã đồng bộ ${report.catalogSize} tính năng. Không có tính năng mới, cấu hình cũ giữ nguyên.` });
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

  const handleAcknowledgeAll = () => askConfirm({
    title: `Duyệt ${newFeatureKeys.length} tính năng mới`,
    message: <>Giữ nguyên <strong>quyền mặc định</strong> đang áp dụng và tắt nhãn MỚI. Thao tác này không thay đổi bất kỳ quyền nào; bạn vẫn có thể chỉnh từng ô sau.</>,
    confirmLabel: 'Duyệt tất cả'
  }, async () => {
    setAcknowledging(true);
    const ok = await acknowledgeFeatures();
    setAcknowledging(false);
    if (ok) setToast({ tone: 'ok', text: 'Đã duyệt toàn bộ tính năng mới.' });
  });

  const handleResetGroup = (role: string, group: string) => askConfirm({
    title: `Khôi phục nhóm "${group}"`,
    message: <>Xóa toàn bộ ghi đè của nhóm <strong>{group}</strong> thuộc chức danh <strong>{roleLabel(role)}</strong>. Nhóm sẽ kế thừa lại 100% quyền của chức danh.</>,
    confirmLabel: 'Khôi phục',
    tone: 'danger'
  }, () => runCell(`reset:${role}::${group}`, () => resetGroupPermissions(role, group)));

  const handleResetUser = (u: UserOverrideInfo) => askConfirm({
    title: `Khôi phục quyền của ${u.fullName}`,
    message: <>Xóa toàn bộ <strong>{selectedUserOverrideCount} ghi đè cá nhân</strong>. Người này sẽ dùng lại quyền theo Nhóm / Chức danh.</>,
    confirmLabel: 'Khôi phục tất cả',
    tone: 'danger'
  }, () => runCell(`reset:user:${u.id}`, () => resetUserPermissions(u.id)));

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

  const roleLabel = (key: string) => roles.find(r => r.key === key)?.label || key;
  const currentRoleObj = roles.find(r => r.key === selectedRoleForGroup) || roles[0];
  const colSpanCount = activeTab === 'roles' ? roles.length + 1 : activeTab === 'groups' ? displayGroups.length + 1 : 3;
  const allCollapsed = modules.length > 0 && modules.every(m => collapsedModules[m.id]);
  const toggleAllModules = () =>
    setCollapsedModules(allCollapsed ? {} : Object.fromEntries(modules.map(m => [m.id, true])));

  const stats = [
    { label: 'Tính năng', value: features.length, cls: 'text-[#1B3A6B]' },
    { label: 'Chức danh', value: roles.length, cls: 'text-[#1B3A6B]' },
    { label: 'Nhóm có ghi đè', value: customGroupKeys.length, cls: 'text-indigo-700' },
    { label: 'Cá nhân có ghi đè', value: usersWithOverrides.length, cls: 'text-emerald-700' },
    { label: 'Chờ duyệt', value: newFeatureKeys.length, cls: newFeatureKeys.length ? 'text-amber-600' : 'text-slate-400' }
  ];

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] text-white rounded-xl shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Ma trận Phân quyền</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thứ tự ưu tiên: <strong className="text-emerald-700">Cá nhân</strong> › <strong className="text-indigo-700">Nhóm</strong> › <strong className="text-[#1B3A6B]">Chức danh</strong> › Mặc định hệ thống. Mọi thay đổi được lưu ngay.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openGuide('overview')}
              className="h-10 inline-flex items-center gap-2 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs"
            >
              <BookOpen className="h-4 w-4 text-[#1B3A6B]" /> Hướng dẫn sử dụng
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={loading || syncing}
              title="Quét tính năng mới & tải lại ma trận. Không ghi đè cấu hình cũ."
              className="h-10 inline-flex items-center gap-2 px-4 bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl text-xs shadow-sm active:scale-[0.98] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading || syncing ? 'animate-spin' : ''}`} /> Đồng bộ
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          {stats.map(s => (
            <div key={s.label} className="bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2">
              <div className={`text-lg font-bold leading-tight ${s.cls}`}>{s.value}</div>
              <div className="text-[11px] text-slate-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gợi ý lần đầu ── */}
      {!guideSeen && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <HelpCircle className="h-5 w-5 text-[#1B3A6B] shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <div className="font-bold text-sm">Lần đầu sử dụng Ma trận Phân quyền?</div>
              Đọc hướng dẫn 5 phút để hiểu cơ chế 3 tầng, cách đọc ô Kế thừa / Ghi đè và các tình huống thường gặp.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => { setGuideSeen(true); writeGuideSeen(); }} className="h-9 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900">Để sau</button>
            <button type="button" onClick={() => openGuide('overview')} className="h-9 px-4 bg-[#1B3A6B] hover:bg-[#2A518E] text-white text-xs font-semibold rounded-xl">Xem hướng dẫn</button>
          </div>
        </div>
      )}

      {/* ── Banner tính năng mới ── */}
      {newFeatures.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/70 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-1.5 bg-amber-100 rounded-lg shrink-0"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
              <div className="min-w-0">
                <div className="font-bold text-amber-900 text-sm">
                  {newFeatures.length} tính năng mới đang chờ duyệt phân quyền
                </div>
                <div className="text-xs text-amber-800 mt-1">
                  Hệ thống đã tự áp dụng quyền mặc định. Kiểm tra lại, chỉnh nếu cần. Chỉnh bất kỳ ô nào trên dòng sẽ tự duyệt dòng đó.{' '}
                  <button type="button" onClick={() => openGuide('new-features')} className="underline font-semibold">Tìm hiểu thêm</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {newFeatures.map(f => (
                    <span key={f.key} className="text-[10px] bg-white/80 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-medium" title={f.key}>{f.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={handleFilterNew}
                className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border ${
                  onlyNew ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Filter className="h-3.5 w-3.5" /> {onlyNew ? 'Bỏ lọc' : `Lọc xem ngay (${newFeatures.length})`}
              </button>
              <button
                type="button"
                onClick={handleAcknowledgeAll}
                disabled={acknowledging}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {acknowledging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Áp dụng quyền mặc định & Đánh dấu đã duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs 3 tầng ── */}
      <div className="grid sm:grid-cols-3 gap-2">
        {TIER_TABS.map(t => {
          const active = activeTab === t.id;
          const badge = t.id === 'roles' ? `${roles.length} chức danh`
            : t.id === 'groups' ? (customGroupKeys.length ? `${customGroupKeys.length} tùy chỉnh` : 'Chưa có ghi đè')
            : (usersWithOverrides.length ? `${usersWithOverrides.length} người` : 'Chưa có ghi đè');
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setActiveTab(t.id); setOnlyOverrides(false); }}
              className={`text-left rounded-2xl border p-3.5 transition-all ${
                active ? 'bg-white border-[#1B3A6B] ring-2 ring-[#1B3A6B]/10 shadow-sm' : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-2 font-bold text-sm ${active ? 'text-[#1B3A6B]' : 'text-slate-700'}`}>
                  <span className={`p-1.5 rounded-lg ${active ? 'bg-[#1B3A6B] text-white' : 'bg-slate-100 text-slate-500'}`}>{t.icon}</span>
                  {t.title}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{badge}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">{t.desc}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1"><Layers className="h-3 w-3" /> {t.tier}</div>
            </button>
          );
        })}
      </div>

      {/* ── Bảng ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm tính năng (gõ không dấu được)..."
                  className="h-10 pl-9 pr-8 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 w-72 bg-slate-50/50"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Xóa tìm kiếm">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {activeTab === 'groups' && (
                <>
                  <select
                    value={selectedRoleForGroup}
                    onChange={(e) => setSelectedRoleForGroup(e.target.value)}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Chọn chức danh"
                  >
                    {roles.map(r => {
                      const n = customGroupKeys.filter(k => k.startsWith(`${r.key}::`)).length;
                      return <option key={r.key} value={r.key}>Chức danh: {r.label}{n ? ` (${n} nhóm tùy chỉnh)` : ''}</option>;
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
                        placeholder="Tên nhóm (khớp chính xác)"
                        className="h-10 px-3 text-xs border border-indigo-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 w-48 bg-white"
                      />
                      <button type="button" onClick={addGroup} className="h-10 w-10 inline-flex items-center justify-center text-white bg-indigo-600 rounded-xl" aria-label="Thêm"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setShowAddGroupInput(false)} className="h-10 w-10 inline-flex items-center justify-center text-slate-500 bg-slate-100 rounded-xl" aria-label="Hủy"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddGroupInput(true)}
                      className="h-10 inline-flex items-center gap-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm nhóm
                    </button>
                  )}
                </>
              )}

              {activeTab === 'users' && (
                <>
                  <div className="relative">
                    <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => handleUserSearch(e.target.value)}
                      placeholder="Tìm nhân viên theo tên, username, email..."
                      className="h-10 pl-9 pr-8 text-xs border border-emerald-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 w-72 bg-white"
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500 animate-spin" />}
                    {userSearchResults.length > 0 && userSearchQuery.length >= 2 && (
                      <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 w-80 max-h-64 overflow-auto">
                        {userSearchResults.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setSelectedUser(u); setUserSearchQuery(''); setUserSearchResults([]); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 text-xs flex items-center gap-2.5 border-b border-slate-100 last:border-0"
                          >
                            <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">
                              {u.fullName?.charAt(0) || '?'}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{u.fullName}</div>
                              <div className="text-[10px] text-slate-500 truncate">{roleLabel(u.role)} • {u.group || 'Không nhóm'} • {u.username}</div>
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
                      className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 max-w-[260px]"
                      aria-label="Người đã có quyền riêng"
                    >
                      <option value="">Người đã có quyền riêng ({usersWithOverrides.length})</option>
                      {usersWithOverrides.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} • {roleLabel(u.role)} • {Object.keys(userPermMatrix[u.id] || {}).length} ghi đè
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {activeTab !== 'roles' && (
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={onlyOverrides} onChange={(e) => setOnlyOverrides(e.target.checked)} className="rounded border-slate-300" />
                  Chỉ hiện quyền bị ghi đè
                </label>
              )}
              <button type="button" onClick={toggleAllModules} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#1B3A6B]">
                {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
                {allCollapsed ? 'Mở tất cả' : 'Thu gọn tất cả'}
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <PermissionLegend showInheritance={activeTab !== 'roles'} />
            <div className="flex items-center gap-2">
              {onlyNew && (
                <button type="button" onClick={() => setOnlyNew(false)} className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded-lg font-semibold">
                  Đang lọc: tính năng mới <X className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => openGuide(TIER_TABS.find(t => t.id === activeTab)!.guide)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B3A6B] hover:underline"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Cách dùng tab này
              </button>
            </div>
          </div>
        </div>

        {/* Thẻ người dùng đang chọn */}
        {activeTab === 'users' && selectedUser && (
          <div className="mx-4 mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/70 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">
                {selectedUser.fullName?.charAt(0) || '?'}
              </span>
              <div>
                <div className="font-bold text-emerald-900 text-sm">{selectedUser.fullName}</div>
                <div className="text-[11px] text-emerald-700">
                  Chức danh <strong>{roleLabel(selectedUser.role)}</strong> • Nhóm <strong>{selectedUser.group || '—'}</strong> • {selectedUser.username}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                selectedUserOverrideCount ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-slate-500 border-slate-200'
              }`}>
                {selectedUserOverrideCount ? `${selectedUserOverrideCount} quyền ghi đè` : 'Đang kế thừa toàn bộ'}
              </span>
            </div>
            <div className="flex gap-2">
              {selectedUserOverrideCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleResetUser(selectedUser)}
                  disabled={pending.has(`reset:user:${selectedUser.id}`)}
                  className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Khôi phục tất cả
                </button>
              )}
              <button type="button" onClick={() => setSelectedUser(null)} className="h-9 w-9 inline-flex items-center justify-center text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50" aria-label="Bỏ chọn">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'users' && !selectedUser ? (
          <div className="text-center py-16 px-4">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
              <UserPlus className="h-7 w-7 text-emerald-500" />
            </div>
            <div className="text-sm font-bold text-slate-700">Chọn một nhân viên để xem và cấu hình quyền</div>
            <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Tìm theo tên ở thanh công cụ phía trên, hoặc chọn từ danh sách người đã có quyền riêng. Cột "Nguồn" sẽ cho biết mỗi quyền đến từ tầng nào.
            </div>
          </div>
        ) : (
          <div ref={tableRef} className="overflow-auto max-h-[calc(100vh-200px)] relative scroll-mt-4 mt-0">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-50 text-xs">
                  <th className="py-3 px-4 font-bold text-slate-600 min-w-[300px] sticky top-0 left-0 z-30 bg-slate-50 border-b border-slate-200 uppercase tracking-wide text-[10px]">
                    Tính năng ({filteredFeatures.length})
                  </th>

                  {activeTab === 'roles' && roles.map(r => (
                    <th key={r.key} className="py-3 px-2 text-center min-w-[96px] bg-slate-50 border-b border-slate-200">
                      <span className={`inline-block px-2 py-1 rounded-lg border text-[11px] font-semibold ${r.badgeColor}`}>{r.label}</span>
                    </th>
                  ))}

                  {activeTab === 'groups' && displayGroups.map(grp => {
                    const gk = `${selectedRoleForGroup}::${grp}`;
                    const count = Object.keys(groupOverrideMatrix[gk] || {}).length;
                    return (
                      <th key={grp} className="py-3 px-2 text-center min-w-[104px] bg-slate-50 border-b border-slate-200">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                            count ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
                          }`}>{grp}</span>
                          {count ? (
                            <button
                              type="button"
                              onClick={() => handleResetGroup(selectedRoleForGroup, grp)}
                              disabled={pending.has(`reset:${gk}`)}
                              className="text-[10px] text-amber-700 hover:text-rose-600 font-semibold inline-flex items-center gap-0.5"
                              title={`Khôi phục toàn bộ nhóm ${grp} về theo chức danh ${currentRoleObj?.label}`}
                            >
                              <Sparkles className="h-2.5 w-2.5" /> {count} ghi đè <RotateCcw className="h-2.5 w-2.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-normal">Kế thừa toàn bộ</span>
                          )}
                        </div>
                      </th>
                    );
                  })}

                  {activeTab === 'users' && (
                    <>
                      <th className="py-3 px-3 text-center min-w-[120px] bg-slate-50 border-b border-slate-200 uppercase tracking-wide text-[10px] text-slate-600 font-bold">Quyền hiệu lực</th>
                      <th className="py-3 px-3 min-w-[260px] bg-slate-50 border-b border-slate-200 uppercase tracking-wide text-[10px] text-slate-600 font-bold">Nguồn</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="text-xs">
                {filteredFeatures.length === 0 && (
                  <tr>
                    <td colSpan={colSpanCount} className="py-14 text-center">
                      <div className="text-sm font-semibold text-slate-600">Không có tính năng nào khớp bộ lọc</div>
                      <button
                        type="button"
                        onClick={() => { setSearch(''); setOnlyNew(false); setOnlyOverrides(false); }}
                        className="mt-2 text-xs font-semibold text-[#1B3A6B] hover:underline"
                      >
                        Xóa bộ lọc
                      </button>
                    </td>
                  </tr>
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
                        className="cursor-pointer select-none"
                      >
                        <td colSpan={colSpanCount} className="py-2 px-4 sticky left-0 z-10 bg-slate-100/95 border-y border-slate-200 hover:bg-slate-200/70">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                            <span>{mod.name}</span>
                            <span className="text-[10px] bg-white text-slate-600 border border-slate-200 font-semibold px-2 py-0.5 rounded-full">{modFeatures.length}</span>
                            {modNewCount > 0 && (
                              <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">{modNewCount} mới</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && modFeatures.map(feat => {
                        const isNew = newKeySet.has(feat.key);
                        return (
                          <tr key={feat.key} className={`group border-b border-slate-100 ${isNew ? 'bg-amber-50/50' : 'hover:bg-blue-50/30'}`}>
                            <td className={`py-3 px-4 align-middle sticky left-0 z-10 border-r border-slate-100 ${
                              isNew ? 'bg-amber-50 shadow-[inset_4px_0_0_0_#f59e0b]' : 'bg-white group-hover:bg-blue-50/60'
                            }`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-900">{feat.name}</span>
                                {isNew && (
                                  <>
                                    <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded-md">MỚI</span>
                                    <button
                                      type="button"
                                      onClick={() => acknowledgeFeatures([feat.key])}
                                      className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold inline-flex items-center gap-0.5 hover:underline"
                                      title="Giữ quyền mặc định hiện tại và đánh dấu đã duyệt"
                                    >
                                      <CheckCheck className="h-3 w-3" /> Duyệt
                                    </button>
                                  </>
                                )}
                                {feat.devOnly && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded-md" title="Công cụ Dev: Admin không tự có quyền">DEV</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{feat.description}</div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">{feat.key}</div>
                            </td>

                            {activeTab === 'roles' && roles.map(r => {
                              const resolved = resolveRole(r.key, feat.key);
                              const cellKey = `role:${r.key}:${feat.key}`;
                              return (
                                <td key={r.key} className="py-3 px-2 text-center align-middle">
                                  <ToggleCell
                                    resolved={resolved}
                                    showInheritance={false}
                                    isOverride={false}
                                    pending={pending.has(cellKey)}
                                    title={resolved.source === 'admin'
                                      ? 'Admin luôn có quyền này'
                                      : `${r.label}: ${resolved.value ? 'ĐANG BẬT' : 'ĐANG TẮT'} — bấm để ${resolved.value ? 'tắt' : 'bật'}`}
                                    onToggle={() => runCell(cellKey, () => updatePermission(r.key, feat.key, !resolved.value))}
                                  />
                                </td>
                              );
                            })}

                            {activeTab === 'groups' && displayGroups.map(grp => {
                              const resolved = resolveGroup(selectedRoleForGroup, grp, feat.key);
                              const cellKey = `group:${selectedRoleForGroup}::${grp}:${feat.key}`;
                              const isOverride = resolved.source === 'group';
                              return (
                                <td key={grp} className="py-3 px-2 text-center align-middle">
                                  <ToggleCell
                                    resolved={resolved}
                                    showInheritance
                                    isOverride={isOverride}
                                    pending={pending.has(cellKey)}
                                    title={resolved.source === 'admin'
                                      ? 'Admin luôn có quyền này'
                                      : isOverride
                                      ? `Nhóm ${grp}: GHI ĐÈ ${resolved.value ? 'BẬT' : 'TẮT'} (chức danh đang ${resolved.inheritedValue ? 'bật' : 'tắt'}) — bấm để đổi`
                                      : `Nhóm ${grp}: KẾ THỪA ${resolved.value ? 'BẬT' : 'TẮT'} từ chức danh ${currentRoleObj?.label} — bấm để ghi đè`}
                                    onToggle={() => runCell(cellKey, () => updatePermission(selectedRoleForGroup, feat.key, !resolved.value, grp))}
                                    onClearOverride={() => runCell(cellKey, () => clearGroupOverride(selectedRoleForGroup, grp, feat.key))}
                                    clearLabel={`Bỏ ghi đè, quay về theo chức danh (${resolved.inheritedValue ? 'bật' : 'tắt'})`}
                                  />
                                </td>
                              );
                            })}

                            {activeTab === 'users' && selectedUser && (() => {
                              const resolved = resolveUser(selectedUser, feat.key);
                              const cellKey = `user:${selectedUser.id}:${feat.key}`;
                              const isOverride = resolved.source === 'user';
                              const fromLabel = resolved.inheritedFrom === 'group'
                                ? `nhóm ${selectedUser.group}`
                                : `chức danh ${roleLabel(selectedUser.role)}`;
                              return (
                                <>
                                  <td className="py-3 px-3 text-center align-middle">
                                    <ToggleCell
                                      resolved={resolved}
                                      showInheritance
                                      isOverride={isOverride}
                                      pending={pending.has(cellKey)}
                                      title={resolved.source === 'admin'
                                        ? 'Admin luôn có quyền này'
                                        : isOverride
                                        ? `GHI ĐÈ ${resolved.value ? 'BẬT' : 'TẮT'} — bấm để đổi`
                                        : `KẾ THỪA ${resolved.value ? 'BẬT' : 'TẮT'} từ ${fromLabel} — bấm để ghi đè riêng`}
                                      onToggle={() => runCell(cellKey, () => updateUserPermission(selectedUser.id, feat.key, !resolved.value, selectedUser))}
                                    />
                                  </td>
                                  <td className="py-3 px-3 align-middle">
                                    {resolved.source === 'admin' ? (
                                      <span className="text-[11px] text-slate-500">Admin luôn có quyền</span>
                                    ) : isOverride ? (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md">Ghi đè riêng</span>
                                        <span className="text-[11px] text-slate-500">
                                          {fromLabel.charAt(0).toUpperCase() + fromLabel.slice(1)}: {resolved.inheritedValue ? 'bật' : 'tắt'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => runCell(cellKey, () => clearUserOverride(selectedUser.id, feat.key))}
                                          className="text-[11px] font-semibold text-[#1B3A6B] hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <RotateCcw className="h-3 w-3" /> Khôi phục mặc định
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-500">Kế thừa từ <strong className="text-slate-700">{fromLabel}</strong></span>
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
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[65] max-w-sm bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-slate-700">
          {toast.tone === 'ok'
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            : <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600" aria-label="Đóng"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onCancel={closeConfirm}
        onConfirm={() => { const fn = confirmState?.onConfirm; setConfirmState(null); fn?.(); }}
      />

      <PermissionGuide
        open={guideOpen}
        initialSection={guideSection}
        onClose={closeGuide}
        roles={roles}
        modules={modules}
        featureCount={features.length}
      />
    </div>
  );
};

export default PermissionMatrix;
