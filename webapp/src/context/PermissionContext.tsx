import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../api/client';
import {
  getDefaultPermission,
  SYSTEM_FEATURES,
  SYSTEM_MODULES,
  SYSTEM_ROLES,
  type SystemFeature,
  type SystemModule
} from '../config/permissions';

export interface UserOverrideInfo {
  id: string;
  username: string;
  fullName: string;
  role: string;
  group?: string | null;
}

export interface PermissionSyncReport {
  ranAt: string;
  bootstrap: boolean;
  catalogSize: number;
  newlyRegistered: string[];
  seededKeys: string[];
  seededRoleRows: number;
  unreviewedKeys: string[];
  orphanKeys: string[];
  catalogWarnings: string[];
}

/** Nguồn của quyền hiệu lực, để UI hiển thị "Kế thừa" hay "Ghi đè" */
export type PermissionSource = 'admin' | 'user' | 'group' | 'role';

export interface ResolvedPermission {
  value: boolean;
  source: PermissionSource;
  /** Giá trị nếu bỏ ghi đè ở tầng hiện tại (kế thừa từ tầng trên) */
  inheritedValue: boolean;
  inheritedFrom: 'group' | 'role' | 'admin';
}

type BoolMatrix = Record<string, Record<string, boolean>>;

interface PermissionContextType {
  matrix: BoolMatrix;
  /** CHỈ các ô nhóm được ghi đè riêng: { "ROLE::GROUP": { featureKey: bool } } */
  groupOverrideMatrix: BoolMatrix;
  /** CHỈ các ô cá nhân được ghi đè riêng: { userId: { featureKey: bool } } */
  userPermMatrix: BoolMatrix;
  usersWithOverrides: UserOverrideInfo[];
  newFeatureKeys: string[];
  groups: string[];
  customGroupKeys: string[];
  modules: SystemModule[];
  features: SystemFeature[];
  roles: typeof SYSTEM_ROLES;
  syncReport: PermissionSyncReport | null;
  loading: boolean;
  refetchPermissions: () => Promise<void>;
  syncCatalog: () => Promise<PermissionSyncReport | null>;
  hasPermission: (featureKey: string) => boolean;
  resolveRole: (role: string, featureKey: string) => ResolvedPermission;
  resolveGroup: (role: string, group: string, featureKey: string) => ResolvedPermission;
  resolveUser: (user: { id: string; role: string; group?: string | null }, featureKey: string) => ResolvedPermission;
  updatePermission: (role: string, featureKey: string, isAllowed: boolean, group?: string) => Promise<boolean>;
  clearGroupOverride: (role: string, group: string, featureKey: string) => Promise<boolean>;
  resetGroupPermissions: (role: string, group: string) => Promise<boolean>;
  updateUserPermission: (userId: string, featureKey: string, isAllowed: boolean, userInfo?: UserOverrideInfo) => Promise<boolean>;
  clearUserOverride: (userId: string, featureKey: string) => Promise<boolean>;
  resetUserPermissions: (userId: string) => Promise<boolean>;
  acknowledgeFeatures: (featureKeys?: string[]) => Promise<boolean>;
  searchUsersForPermissions: (query: string) => Promise<UserOverrideInfo[]>;
}

const DEFAULT_GROUPS = ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'];
const isAdminLockedFor = (features: SystemFeature[], role: string, featureKey: string) =>
  role === 'ADMIN' && !features.find(f => f.key === featureKey)?.devOnly;

const PermissionContext = createContext<PermissionContextType | null>(null);

/** Sao chép nông 1 ô ma trận (set hoặc xóa) — không đụng các ô khác */
function setCell(prev: BoolMatrix, rowKey: string, featureKey: string, value: boolean | undefined): BoolMatrix {
  const row = { ...(prev[rowKey] || {}) };
  if (value === undefined) delete row[featureKey];
  else row[featureKey] = value;
  const next = { ...prev };
  if (Object.keys(row).length) next[rowKey] = row;
  else delete next[rowKey];
  return next;
}

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<BoolMatrix>({});
  const [groupOverrideMatrix, setGroupOverrideMatrix] = useState<BoolMatrix>({});
  const [userPermMatrix, setUserPermMatrix] = useState<BoolMatrix>({});
  const [usersWithOverrides, setUsersWithOverrides] = useState<UserOverrideInfo[]>([]);
  const [newFeatureKeys, setNewFeatureKeys] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [features, setFeatures] = useState<SystemFeature[]>(SYSTEM_FEATURES);
  const [modules, setModules] = useState<SystemModule[]>(SYSTEM_MODULES);
  const [roles, setRoles] = useState<typeof SYSTEM_ROLES>(SYSTEM_ROLES);
  const [syncReport, setSyncReport] = useState<PermissionSyncReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Ref để các hàm rollback luôn đọc trạng thái mới nhất
  const stateRef = useRef({ matrix, groupOverrideMatrix, userPermMatrix, newFeatureKeys });
  useEffect(() => {
    stateRef.current = { matrix, groupOverrideMatrix, userPermMatrix, newFeatureKeys };
  }, [matrix, groupOverrideMatrix, userPermMatrix, newFeatureKeys]);

  const fetchPermissions = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await fetchApi('/permissions');
      if (data) {
        if (data.matrix) setMatrix(data.matrix);
        if (data.groupOverrideMatrix) setGroupOverrideMatrix(data.groupOverrideMatrix);
        if (Array.isArray(data.groups)) setGroups(data.groups);
        if (data.userPermMatrix) setUserPermMatrix(data.userPermMatrix);
        if (Array.isArray(data.usersWithOverrides)) setUsersWithOverrides(data.usersWithOverrides);
        if (Array.isArray(data.newFeatureKeys)) setNewFeatureKeys(data.newFeatureKeys);
        // Danh mục lấy từ server (nguồn chuẩn) — file local chỉ là fallback
        if (Array.isArray(data.features) && data.features.length) setFeatures(data.features);
        if (Array.isArray(data.modules) && data.modules.length) setModules(data.modules);
        if (Array.isArray(data.roles) && data.roles.length) setRoles(data.roles);
        setSyncReport(data.syncReport || null);
      }
    } catch (err) {
      console.warn('Failed to fetch permissions matrix, falling back to defaults:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const customGroupKeys = useMemo(() => Object.keys(groupOverrideMatrix), [groupOverrideMatrix]);

  // ── 3-Tier resolution (dùng chung cho hasPermission và UI ma trận) ──
  const resolveRole = useCallback((role: string, featureKey: string): ResolvedPermission => {
    if (isAdminLockedFor(features, role, featureKey)) {
      return { value: true, source: 'admin', inheritedValue: true, inheritedFrom: 'admin' };
    }
    const v = matrix[role]?.[featureKey];
    const value = v !== undefined ? v : getDefaultPermission(role, featureKey);
    return { value, source: 'role', inheritedValue: value, inheritedFrom: 'role' };
  }, [matrix, features]);

  const resolveGroup = useCallback((role: string, group: string, featureKey: string): ResolvedPermission => {
    const base = resolveRole(role, featureKey);
    if (base.source === 'admin') return base;
    const grp = group.trim();
    const ov = grp ? groupOverrideMatrix[`${role}::${grp}`]?.[featureKey] : undefined;
    if (ov !== undefined) return { value: ov, source: 'group', inheritedValue: base.value, inheritedFrom: 'role' };
    return { value: base.value, source: 'role', inheritedValue: base.value, inheritedFrom: 'role' };
  }, [resolveRole, groupOverrideMatrix]);

  const resolveUser = useCallback((u: { id: string; role: string; group?: string | null }, featureKey: string): ResolvedPermission => {
    const base = resolveGroup(u.role, u.group || '', featureKey);
    if (base.source === 'admin') return base;
    const inheritedFrom = base.source === 'group' ? 'group' : 'role';
    const ov = userPermMatrix[u.id]?.[featureKey];
    if (ov !== undefined) return { value: ov, source: 'user', inheritedValue: base.value, inheritedFrom };
    return { value: base.value, source: base.source, inheritedValue: base.value, inheritedFrom };
  }, [resolveGroup, userPermMatrix]);

  const hasPermission = useCallback((featureKey: string): boolean => {
    if (!user) return false;
    return resolveUser({ id: user.id, role: user.role, group: user.group }, featureKey).value;
  }, [user, resolveUser]);

  // Bấm vào ô của tính năng mới → backend tự đánh dấu đã duyệt; phản ánh ngay trên UI
  const dropNewFlag = (featureKey: string) => {
    if (stateRef.current.newFeatureKeys.includes(featureKey)) {
      setNewFeatureKeys(prev => prev.filter(k => k !== featureKey));
    }
  };

  const fail = (err: unknown, fallbackMsg: string) => {
    alert((err as Error)?.message || fallbackMsg);
  };

  // ── Mutations: Optimistic UI, rollback đúng 1 ô khi lỗi (không reload cả bảng) ──
  const updatePermission = async (role: string, featureKey: string, isAllowed: boolean, group?: string): Promise<boolean> => {
    const grp = (group || '').trim();
    const prevNew = stateRef.current.newFeatureKeys;
    let rollback: () => void;
    if (grp) {
      const gk = `${role}::${grp}`;
      const prevVal = stateRef.current.groupOverrideMatrix[gk]?.[featureKey];
      setGroupOverrideMatrix(prev => setCell(prev, gk, featureKey, isAllowed));
      rollback = () => setGroupOverrideMatrix(prev => setCell(prev, gk, featureKey, prevVal));
    } else {
      const prevVal = stateRef.current.matrix[role]?.[featureKey];
      setMatrix(prev => setCell(prev, role, featureKey, isAllowed));
      rollback = () => setMatrix(prev => setCell(prev, role, featureKey, prevVal));
    }
    dropNewFlag(featureKey);
    try {
      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ role, group: grp, featureKey, isAllowed })
      });
      return true;
    } catch (err: unknown) {
      rollback();
      setNewFeatureKeys(prevNew);
      fail(err, 'Lỗi khi cập nhật phân quyền');
      return false;
    }
  };

  const clearGroupOverride = async (role: string, group: string, featureKey: string): Promise<boolean> => {
    const gk = `${role}::${group.trim()}`;
    const prevVal = stateRef.current.groupOverrideMatrix[gk]?.[featureKey];
    if (prevVal === undefined) return true;
    setGroupOverrideMatrix(prev => setCell(prev, gk, featureKey, undefined));
    dropNewFlag(featureKey);
    try {
      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear_group_override', role, group: group.trim(), featureKey })
      });
      return true;
    } catch (err: unknown) {
      setGroupOverrideMatrix(prev => setCell(prev, gk, featureKey, prevVal));
      fail(err, 'Lỗi khi khôi phục quyền nhóm');
      return false;
    }
  };

  const resetGroupPermissions = async (role: string, group: string): Promise<boolean> => {
    const grp = (group || '').trim();
    if (!grp) return false;
    const gk = `${role}::${grp}`;
    const prevRow = stateRef.current.groupOverrideMatrix[gk];
    setGroupOverrideMatrix(prev => {
      const next = { ...prev };
      delete next[gk];
      return next;
    });
    try {
      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset_group', role, group: grp })
      });
      return true;
    } catch (err: unknown) {
      if (prevRow) setGroupOverrideMatrix(prev => ({ ...prev, [gk]: prevRow }));
      fail(err, 'Lỗi khi khôi phục phân quyền nhóm');
      return false;
    }
  };

  const updateUserPermission = async (userId: string, featureKey: string, isAllowed: boolean, userInfo?: UserOverrideInfo): Promise<boolean> => {
    const prevVal = stateRef.current.userPermMatrix[userId]?.[featureKey];
    const prevNew = stateRef.current.newFeatureKeys;
    setUserPermMatrix(prev => setCell(prev, userId, featureKey, isAllowed));
    if (userInfo) {
      setUsersWithOverrides(prev => (prev.some(u => u.id === userId) ? prev : [...prev, userInfo]));
    }
    dropNewFlag(featureKey);
    try {
      await fetchApi('/permissions/user-update', {
        method: 'POST',
        body: JSON.stringify({ userId, featureKey, isAllowed })
      });
      return true;
    } catch (err: unknown) {
      setUserPermMatrix(prev => setCell(prev, userId, featureKey, prevVal));
      setNewFeatureKeys(prevNew);
      fail(err, 'Lỗi khi cập nhật quyền cá nhân');
      return false;
    }
  };

  const clearUserOverride = async (userId: string, featureKey: string): Promise<boolean> => {
    const prevVal = stateRef.current.userPermMatrix[userId]?.[featureKey];
    if (prevVal === undefined) return true;
    setUserPermMatrix(prev => setCell(prev, userId, featureKey, undefined));
    try {
      await fetchApi('/permissions/user-update', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear_user_override', userId, featureKey })
      });
      return true;
    } catch (err: unknown) {
      setUserPermMatrix(prev => setCell(prev, userId, featureKey, prevVal));
      fail(err, 'Lỗi khi khôi phục quyền cá nhân');
      return false;
    }
  };

  const resetUserPermissions = async (userId: string): Promise<boolean> => {
    const prevRow = stateRef.current.userPermMatrix[userId];
    setUserPermMatrix(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    try {
      await fetchApi('/permissions/user-update', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset_user', userId })
      });
      return true;
    } catch (err: unknown) {
      if (prevRow) setUserPermMatrix(prev => ({ ...prev, [userId]: prevRow }));
      fail(err, 'Lỗi khi khôi phục quyền cá nhân');
      return false;
    }
  };

  const acknowledgeFeatures = async (featureKeys?: string[]): Promise<boolean> => {
    const prevNew = stateRef.current.newFeatureKeys;
    setNewFeatureKeys(featureKeys ? prevNew.filter(k => !featureKeys.includes(k)) : []);
    try {
      const data = await fetchApi('/permissions/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ featureKeys: featureKeys || [] })
      });
      if (Array.isArray(data?.newFeatureKeys)) setNewFeatureKeys(data.newFeatureKeys);
      return true;
    } catch (err: unknown) {
      setNewFeatureKeys(prevNew);
      fail(err, 'Lỗi khi đánh dấu đã duyệt');
      return false;
    }
  };

  const syncCatalog = async (): Promise<PermissionSyncReport | null> => {
    let report: PermissionSyncReport | null = null;
    try {
      const data = await fetchApi('/permissions/sync', { method: 'POST' });
      report = data?.report || null;
    } catch (err: unknown) {
      // Người không phải Admin không gọi được sync → chỉ tải lại
      console.warn("Permission sync skipped:", (err as Error)?.message);
    }
    await fetchPermissions();
    return report;
  };

  const searchUsersForPermissions = useCallback(async (query: string): Promise<UserOverrideInfo[]> => {
    try {
      const data = await fetchApi(`/permissions/users-search?q=${encodeURIComponent(query)}`);
      return data?.users || [];
    } catch {
      return [];
    }
  }, []);

  return (
    <PermissionContext.Provider value={{
      matrix,
      groupOverrideMatrix,
      userPermMatrix,
      usersWithOverrides,
      newFeatureKeys,
      groups,
      customGroupKeys,
      modules,
      features,
      roles,
      syncReport,
      loading,
      refetchPermissions: fetchPermissions,
      syncCatalog,
      hasPermission,
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
      searchUsersForPermissions
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = (): PermissionContextType => {
  const ctx = useContext(PermissionContext);
  return ctx || FALLBACK_CONTEXT;
};

// Dùng khi component nằm ngoài PermissionProvider (giữ hành vi cũ: chỉ đọc, mặc định theo code)
const fallbackResolve = (role: string, featureKey: string): ResolvedPermission => {
  const value = isAdminLockedFor(SYSTEM_FEATURES, role, featureKey) || getDefaultPermission(role, featureKey);
  return { value, source: 'role', inheritedValue: value, inheritedFrom: 'role' };
};
const FALLBACK_CONTEXT: PermissionContextType = {
  matrix: {},
  groupOverrideMatrix: {},
  userPermMatrix: {},
  usersWithOverrides: [],
  newFeatureKeys: [],
  groups: DEFAULT_GROUPS,
  customGroupKeys: [],
  modules: SYSTEM_MODULES,
  features: SYSTEM_FEATURES,
  roles: SYSTEM_ROLES,
  syncReport: null,
  loading: false,
  refetchPermissions: async () => {},
  syncCatalog: async () => null,
  hasPermission: () => true,
  resolveRole: fallbackResolve,
  resolveGroup: (role, _group, featureKey) => fallbackResolve(role, featureKey),
  resolveUser: (u, featureKey) => fallbackResolve(u.role, featureKey),
  updatePermission: async () => false,
  clearGroupOverride: async () => false,
  resetGroupPermissions: async () => false,
  updateUserPermission: async () => false,
  clearUserOverride: async () => false,
  resetUserPermissions: async () => false,
  acknowledgeFeatures: async () => false,
  searchUsersForPermissions: async () => []
};
