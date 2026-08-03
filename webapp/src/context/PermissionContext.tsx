import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../api/client';
import { getDefaultPermission, SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, type SystemFeature } from '../config/permissions';

interface PermissionContextType {
  matrix: Record<string, Record<string, boolean>>;
  modules: typeof SYSTEM_MODULES;
  features: SystemFeature[];
  roles: typeof SYSTEM_ROLES;
  loading: boolean;
  refetchPermissions: () => Promise<void>;
  hasPermission: (featureKey: string) => boolean;
  updatePermission: (role: string, featureKey: string, isAllowed: boolean) => Promise<boolean>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await fetchApi('/permissions');
      if (data && data.matrix) {
        setMatrix(data.matrix);
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

    if (matrix[role] && matrix[role][featureKey] !== undefined) {
      return matrix[role][featureKey];
    }
    return getDefaultPermission(role, featureKey);
  }, [user, matrix]);

  const updatePermission = async (role: string, featureKey: string, isAllowed: boolean): Promise<boolean> => {
    try {
      // Optimistic update
      setMatrix(prev => ({
        ...prev,
        [role]: {
          ...(prev[role] || {}),
          [featureKey]: isAllowed
        }
      }));

      await fetchApi('/permissions/update', {
        method: 'POST',
        body: JSON.stringify({ role, featureKey, isAllowed })
      });
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật phân quyền');
      // Revert on error
      fetchPermissions();
      return false;
    }
  };

  return (
    <PermissionContext.Provider value={{
      matrix,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      loading,
      refetchPermissions: fetchPermissions,
      hasPermission,
      updatePermission
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = (): PermissionContextType => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermission must be used within a PermissionProvider');
  }
  return context;
};
