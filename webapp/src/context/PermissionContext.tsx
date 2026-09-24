import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../api/client';
import { getDefaultPermission, SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, type SystemFeature } from '../config/permissions';

interface UserOverrideInfo {
  id: string;
  username: string;
  fullName: string;
  role: string;
  group?: string | null;
}

interface PermissionContextType {
  matrix: Record<string, Record<string, boolean>>;
  groupMatrix: Record<string, Record<string, boolean>>;
  userPermMatrix: Record<string, Record<string, boolean>>;
  usersWithOverrides: UserOverrideInfo[];
  newFeatureKeys: string[];
  groups: string[];
  customGroupKeys: string[];
  modules: typeof SYSTEM_MODULES;
  features: SystemFeature[];
  roles: typeof SYSTEM_ROLES;
  loading: boolean;
  refetchPermissions: () => Promise<void>;
  hasPermission: (featureKey: string) => boolean;
  updatePermission: (role: string, featureKey: string, isAllowed: boolean, group?: string) => Promise<boolean>;
  resetGroupPermissions: (role: string, group: string) => Promise<boolean>;
  updateUserPermission: (userId: string, featureKey: string, isAllowed: boolean) => Promise<boolean>;
  resetUserPermissions: (userId: string) => Promise<boolean>;
  searchUsersForPermissions: (query: string) => Promise<UserOverrideInfo[]>;
}

const defaultPermissionContext: PermissionContextType = {
  matrix: {},
  groupMatrix: {},
  userPermMatrix: {},
  usersWithOverrides: [],
  newFeatureKeys: [],
  groups: ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'],
  customGroupKeys: [],
  modules: SYSTEM_MODULES,
  features: SYSTEM_FEATURES,
  roles: SYSTEM_ROLES,
  loading: false,
  refetchPermissions: async () => {},
  hasPermission: () => true,
  updatePermission: async () => false,
  resetGroupPermissions: async () => false,
  updateUserPermission: async () => false,
  resetUserPermissions: async () => false,
  searchUsersForPermissions: async () => []
};

const PermissionContext = createContext<PermissionContextType>(defaultPermissionContext);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [groupMatrix, setGroupMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [userPermMatrix, setUserPermMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [usersWithOverrides, setUsersWithOverrides] = useState<UserOverrideInfo[]>([]);
  const [newFeatureKeys, setNewFeatureKeys] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>(['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin']);
  const [customGroupKeys, setCustomGroupKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await fetchApi('/permissions');
      if (data) {
        if (data.matrix) setMatrix(data.matrix);
        if (data.groupMatrix) setGroupMatrix(data.groupMatrix);
        if (data.groups && Array.isArray(data.groups)) setGroups(data.groups);
        if (data.customGroupKeys && Array.isArray(data.customGroupKeys)) setCustomGroupKeys(data.customGroupKeys);
        if (data.userPermMatrix) setUserPermMatrix(data.userPermMatrix);
        if (data.usersWithOverrides) setUsersWithOverrides(data.usersWithOverrides);
        if (data.newFeatureKeys) setNewFeatureKeys(data.newFeatureKeys);
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

  const hasPermission = useCallback((featureKey: string): boolean => {
    if (!user) return false;
    const role = user.role;
    const feat = SYSTEM_FEATURES.find(f => f.key === featureKey);

    // Admin luôn có tất cả quyền thông thường (trừ các tính năng devOnly cần kiểm tra cấu hình riêng)
    if (role === 'ADMIN' && !feat?.devOnly) return true;

    // 0. Kiểm tra quyền riêng cấp cá nhân (User-Level Override) — ưu tiên cao nhất
    if (user.id && userPermMatrix[user.id] && userPermMatrix[user.id][featureKey] !== undefined) {
      return userPermMatrix[user.id][featureKey];
    }

    // 1. Kiểm tra quyền riêng theo Nhóm nếu user có group
    const userGroup = user.group?.trim();
    if (userGroup) {
      const groupKey = `${role}::${userGroup}`;
      if (groupMatrix[groupKey] && groupMatrix[groupKey][featureKey] !== undefined) {
        return groupMatrix[groupKey][featureKey];
      }
    }

    // 2. Kiểm tra quyền chung theo Role
    if (matrix[role] && matrix[role][featureKey] !== undefined) {
      return matrix[role][featureKey];
    }

    // 3. Fallback mặc định theo định nghĩa hệ thống
    return getDefaultPermission(role, featureKey);
  }, [user, matrix, groupMatrix, userPermMatrix]);

  const updatePermission = async (role: string, featureKey: string, isAllowed: boolean, group?: string): Promise<boolean> => {
    const grp = (group || '').trim();
    try {
      if (grp) {
        const groupKey = `${role}::${grp}`;
        setGroupMatrix(prev => ({
          ...prev,
          [groupKey]: {
            ...(prev[groupKey] || {}),
            [featureKey]: isAllowed
          }
        }));
        if (!customGroupKeys.includes(groupKey)) {
          setCustomGroupKeys(prev => [...prev, groupKey]);
        }
      } else {
        setMatrix(prev => ({
          ...prev,
          [role]: {
            ...(prev[role] || {}),
            [featureKey]: isAllowed
          }
        }));
      }

      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ role, group: grp, featureKey, isAllowed })
      });
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật phân quyền');
      fetchPermissions();
      return false;
    }
  };

  const resetGroupPermissions = async (role: string, group: string): Promise<boolean> => {
    const grp = (group || '').trim();
    if (!grp) return false;
    try {
      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset_group', role, group: grp })
      });
      await fetchPermissions();
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi khi khôi phục phân quyền nhóm');
      return false;
    }
  };

  const updateUserPermission = async (userId: string, featureKey: string, isAllowed: boolean): Promise<boolean> => {
    try {
      // Optimistic update
      setUserPermMatrix(prev => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          [featureKey]: isAllowed
        }
      }));

      await fetchApi('/permissions/user-update', {
        method: 'POST',
        body: JSON.stringify({ userId, featureKey, isAllowed })
      });
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật quyền cá nhân');
      fetchPermissions();
      return false;
    }
  };

  const resetUserPermissions = async (userId: string): Promise<boolean> => {
    try {
      await fetchApi('/permissions/user-update', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset_user', userId })
      });
      await fetchPermissions();
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi khi khôi phục quyền cá nhân');
      return false;
    }
  };

  const searchUsersForPermissions = async (query: string): Promise<UserOverrideInfo[]> => {
    try {
      const data = await fetchApi(`/permissions/users-search?q=${encodeURIComponent(query)}`);
      return data?.users || [];
    } catch {
      return [];
    }
  };

  return (
    <PermissionContext.Provider value={{
      matrix,
      groupMatrix,
      userPermMatrix,
      usersWithOverrides,
      newFeatureKeys,
      groups,
      customGroupKeys,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      loading,
      refetchPermissions: fetchPermissions,
      hasPermission,
      updatePermission,
      resetGroupPermissions,
      updateUserPermission,
      resetUserPermissions,
      searchUsersForPermissions
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = (): PermissionContextType => {
  return useContext(PermissionContext) || defaultPermissionContext;
};
