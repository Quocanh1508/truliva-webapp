import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../api/client';
import { getDefaultPermission, SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, type SystemFeature } from '../config/permissions';

interface PermissionContextType {
  matrix: Record<string, Record<string, boolean>>;
  groupMatrix: Record<string, Record<string, boolean>>;
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
}

const defaultPermissionContext: PermissionContextType = {
  matrix: {},
  groupMatrix: {},
  groups: ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'],
  customGroupKeys: [],
  modules: SYSTEM_MODULES,
  features: SYSTEM_FEATURES,
  roles: SYSTEM_ROLES,
  loading: false,
  refetchPermissions: async () => {},
  hasPermission: () => true,
  updatePermission: async () => false,
  resetGroupPermissions: async () => false
};

const PermissionContext = createContext<PermissionContextType>(defaultPermissionContext);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [groupMatrix, setGroupMatrix] = useState<Record<string, Record<string, boolean>>>({});
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
    if (role === 'ADMIN') return true; // Admin luôn có tất cả quyền

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
  }, [user, matrix, groupMatrix]);

  const updatePermission = async (role: string, featureKey: string, isAllowed: boolean, group?: string): Promise<boolean> => {
    const grp = (group || '').trim();
    try {
      if (grp) {
        const groupKey = `${role}::${grp}`;
        // Optimistic update cho groupMatrix
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
        // Optimistic update cho Role matrix
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

  return (
    <PermissionContext.Provider value={{
      matrix,
      groupMatrix,
      groups,
      customGroupKeys,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      loading,
      refetchPermissions: fetchPermissions,
      hasPermission,
      updatePermission,
      resetGroupPermissions
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = (): PermissionContextType => {
  return useContext(PermissionContext) || defaultPermissionContext;
};
