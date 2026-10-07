import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchApi, getStations } from '../../api/client';
import { isValidPhone, PHONE_ERROR_MSG } from '../../utils/phone';
import { 
  UserPlus, Lock, Unlock, Search, Filter, X, Pencil, Download, Shield, Users, 
  RefreshCw, ShieldCheck, Loader2, Phone, Mail, User, Building2, Package 
} from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { matchesSearchTerm } from '../../utils/text';
import { useAuth, type UserRole } from '../../context/AuthContext';
import PermissionMatrix from '../../components/PermissionMatrix';

// Helper to get avatar initials
function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Helper to get role badge style (Professional & Clean, No Emojis)
function getRoleBadge(role: string) {
  switch (role) {
    case 'ADMIN':
      return { label: 'ADMIN', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'COORDINATOR':
      return { label: 'COORDINATOR', className: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'SALE_SUPERVISOR':
      return { label: 'SALE SUPERVISOR', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'SALER':
      return { label: 'SALER', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'HOTLINE':
      return { label: 'HOTLINE', className: 'bg-pink-50 text-pink-700 border-pink-200' };
    case 'STAFF':
      return { label: 'STAFF', className: 'bg-teal-50 text-teal-700 border-teal-200' };
    case 'DEV':
      return { label: 'DEV', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'KTV':
    default:
      return { label: role || 'KTV', className: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
}

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

const PREDEFINED_GROUPS: string[] = ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'];

export default function UserManage() {
  const { confirm } = useConfirm();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  
  // New role, group and pancake account fields
  const [role, setRole] = useState<UserRole>('KTV');
  const [group, setGroup] = useState('');
  const [selectedGroupOption, setSelectedGroupOption] = useState('');
  const [customGroup, setCustomGroup] = useState('');
  const [pancakeAccountName, setPancakeAccountName] = useState('');
  
  // Helper to load saved filters from sessionStorage
  const getSavedUserFilter = (key: string, defaultValue: any) => {
    try {
      const saved = sessionStorage.getItem('truliva_user_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[key] !== undefined) return parsed[key];
      }
    } catch (e) {}
    return defaultValue;
  };

  // Main tab state (users list vs permissions matrix)
  const [mainTab, setMainTab] = useState<'users' | 'permissions'>('users');

  // Filter state (restored from sessionStorage)
  const [searchText, setSearchText] = useState(() => getSavedUserFilter('searchText', ''));
  const [filterMainStation, setFilterMainStation] = useState(() => getSavedUserFilter('filterMainStation', ''));
  const [filterTechStation, setFilterTechStation] = useState(() => getSavedUserFilter('filterTechStation', ''));
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>(() => getSavedUserFilter('filterStatus', 'all'));

  // Save filters to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem('truliva_user_filters', JSON.stringify({
      searchText, filterMainStation, filterTechStation, filterStatus
    }));
  }, [searchText, filterMainStation, filterTechStation, filterStatus]);

  // Form Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'personal'>('basic');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [techStationId, setTechStationId] = useState('');
  const [isActive, setIsActive] = useState(true);

  // New profile fields
  const [address, setAddress] = useState('');
  const [cccdNumber, setCccdNumber] = useState('');
  const [cccdDate, setCccdDate] = useState('');
  const [cccdPlace, setCccdPlace] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [email, setEmail] = useState('');
  const [originalUser, setOriginalUser] = useState<any>(null);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [applyScopeChoice, setApplyScopeChoice] = useState<'OVERWRITE' | 'FUTURE_ONLY'>('OVERWRITE');
  const [submittingScope, setSubmittingScope] = useState(false);

  const [error, setError] = useState('');

  const openCreateModal = () => {
    setModalMode('create');
    setEditingUserId(null);
    setUsername('');
    setPassword('');
    setFullName('');
    setPhone('');
    setTechStationId('');
    setAddress('');
    setCccdNumber('');
    setCccdDate('');
    setCccdPlace('');
    setBankAccount('');
    setBankName('');
    setEmail('');
    setWarehouseId('');
    setWarehouseName('');
    setRole('KTV');
    setGroup('');
    setSelectedGroupOption('');
    setCustomGroup('');
    setPancakeAccountName('');
    setIsActive(true);
    setActiveTab('basic');
    setOriginalUser(null);
    setModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setModalMode('edit');
    setEditingUserId(user.id);
    setOriginalUser(user);
    setUsername(user.username || '');
    setPassword(''); // Trống khi sửa đổi
    setFullName(user.fullName || '');
    setPhone(user.phoneNumber || '');
    setTechStationId(user.techStationId || '');
    setAddress(user.address || '');
    setCccdNumber(user.cccdNumber || '');
    setCccdDate(user.cccdDate || '');
    setCccdPlace(user.cccdPlace || '');
    setBankAccount(user.bankAccount || '');
    setBankName(user.bankName || '');
    setEmail(user.email || '');
    setWarehouseId(user.warehouseId || '');
    setWarehouseName(user.warehouseName || '');
    setRole(user.role || 'KTV');

    const userGroup = user.group || '';
    if (PREDEFINED_GROUPS.includes(userGroup)) {
      setSelectedGroupOption(userGroup);
      setCustomGroup('');
      setGroup(userGroup);
    } else if (userGroup) {
      setSelectedGroupOption('OTHER');
      setCustomGroup(userGroup);
      setGroup(userGroup);
    } else {
      setSelectedGroupOption('');
      setCustomGroup('');
      setGroup('');
    }

    setPancakeAccountName(user.pancakeAccountName || '');
    setIsActive(user.isActive !== false);
    setActiveTab('basic');
    setError('');
    setModalOpen(true);
  };

  useEffect(() => {
    loadUsers();
    getStations().then(setStations).catch(console.error);
    fetchApi('/inventory/warehouses')
      .then(setWarehouses)
      .catch(err => console.error('Lỗi tải danh sách kho', err));
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchApi('/users');
      const staffOnly = (data.users || []).filter(
        (u: any) => u.group !== 'CUSTOMER' && !u.username?.startsWith('zalo_')
      );
      setUsers(staffOnly);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ── Build flat list of tech stations for filter dropdown ──
  const allTechStations = useMemo(() => {
    const list: { id: string; name: string; mainId: string; mainName: string }[] = [];
    stations.forEach((main: any) => {
      getSortedTechStations(main).forEach((tech: any) => {
        list.push({ id: tech.id, name: tech.name, mainId: main.id, mainName: main.name });
      });
    });
    return list;
  }, [stations]);

  // ── Filter tech stations by selected main station ──
  const filteredTechStations = useMemo(() => {
    if (!filterMainStation) return allTechStations;
    return allTechStations.filter(ts => ts.mainId === filterMainStation);
  }, [allTechStations, filterMainStation]);

  // ── Filtered users ──
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Text search (name, phone, username)
    if (searchText.trim()) {
      result = result.filter(u =>
        (u.fullName && matchesSearchTerm(u.fullName, searchText)) ||
        (u.phoneNumber && matchesSearchTerm(u.phoneNumber, searchText)) ||
        (u.username && matchesSearchTerm(u.username, searchText))
      );
    }

    // Main station filter
    if (filterMainStation) {
      const techIdsInMain = allTechStations
        .filter(ts => ts.mainId === filterMainStation)
        .map(ts => ts.id);
      result = result.filter(u => techIdsInMain.includes(u.techStationId));
    }

    // Tech station filter
    if (filterTechStation) {
      result = result.filter(u => u.techStationId === filterTechStation);
    }

    // Status filter
    if (filterStatus === 'active') {
      result = result.filter(u => u.isActive);
    } else if (filterStatus === 'inactive') {
      result = result.filter(u => !u.isActive);
    }

    return result;
  }, [users, searchText, filterMainStation, filterTechStation, filterStatus, allTechStations]);

  const hasFilters = searchText || filterMainStation || filterTechStation || filterStatus !== 'all';

  const clearFilters = () => {
    setSearchText('');
    setFilterMainStation('');
    setFilterTechStation('');
    setFilterStatus('all');
  };

  const executeSave = async (scope: 'OVERWRITE' | 'FUTURE_ONLY' = 'OVERWRITE') => {
    setSubmittingScope(true);
    setError('');
    try {
      if (modalMode === 'create') {
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: username.trim(),
            password,
            fullName: fullName.trim(),
            phoneNumber: phone ? phone.trim() : null,
            role, techStationId,
            address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
            warehouseId, warehouseName, group, pancakeAccountName
          })
        });
      } else {
        await fetchApi(`/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            username: username.trim(),
            fullName: fullName.trim(),
            phoneNumber: phone ? phone.trim() : null,
            role, techStationId, isActive,
            password: password.trim() || undefined,
            address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
            warehouseId, warehouseName, group, pancakeAccountName,
            applyScope: scope
          })
        });
      }
      setScopeModalOpen(false);
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Lỗi cập nhật');
    } finally {
      setSubmittingScope(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (phone && !isValidPhone(phone, true)) {
      setError(PHONE_ERROR_MSG);
      return;
    }

    if (modalMode === 'create') {
      await executeSave('OVERWRITE');
      return;
    }

    // Kiểm tra xem có thay đổi thông tin định danh (Username hoặc Họ tên) không
    const isIdentityChanged = 
      (username.trim().toLowerCase() !== (originalUser?.username || '').trim().toLowerCase()) ||
      (fullName.trim() !== (originalUser?.fullName || '').trim());

    if (isIdentityChanged) {
      setApplyScopeChoice('OVERWRITE');
      setScopeModalOpen(true);
    } else {
      await executeSave('OVERWRITE');
    }
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const wId = e.target.value;
    setWarehouseId(wId);
    const w = warehouses.find(item => String(item.id) === String(wId));
    setWarehouseName(w ? w.name : '');
  };

  const toggleActive = async (id: string, current: boolean) => {
    const isConfirmed = await confirm({
      title: current ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
      message: `Bạn có chắc chắn muốn ${current ? 'Khóa' : 'Mở khóa'} tài khoản này không? KTV sẽ không thể đăng nhập cho đến khi tài khoản được mở lại.`,
      confirmText: current ? 'Khóa' : 'Mở khóa',
      cancelText: 'Hủy',
      type: 'warning'
    });
    
    if (!isConfirmed) return;
    
    try {
      await fetchApi(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !current })
      });
      loadUsers();
    } catch (err) {
      alert('Lỗi cập nhật');
    }
  };


  const handleChangeStation = async (id: string, newStationId: string) => {
    try {
      await fetchApi(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ techStationId: newStationId || null })
      });
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportExcel = () => {
    const query = new URLSearchParams();
    if (searchText.trim()) query.append('search', searchText.trim());
    if (filterMainStation) query.append('mainStationId', filterMainStation);
    if (filterTechStation) query.append('techStationId', filterTechStation);
    if (filterStatus === 'active') query.append('status', 'active');
    if (filterStatus === 'inactive') query.append('status', 'inactive');

    window.open(`/api/users/export?${query.toString()}`, '_blank');
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B] tracking-tight">Quản Lý Nhân Viên & Phân Quyền</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">Danh sách nhân sự, phân bổ trạm công tác, kho hàng POS và ma trận phân quyền hệ thống</p>
        </div>
        {mainTab === 'users' && (
          <div className="flex items-center gap-2.5">
            <button 
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs hover:border-slate-300 transition-all flex items-center gap-2 cursor-pointer" 
              onClick={handleExportExcel} 
              title="Xuất file Excel theo bộ lọc"
            >
              <Download size={15} className="text-slate-500" />
              <span>Xuất Excel</span>
            </button>
            <button 
              className="px-4 py-2 rounded-xl bg-[#1B3A6B] hover:bg-[#234b88] text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]" 
              onClick={openCreateModal}
            >
              <UserPlus size={15} />
              <span>Thêm KTV</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Main Tab Navigation Bar ── */}
      {currentUser?.role === 'ADMIN' && (
        <div className="flex border border-slate-200/90 mb-2 gap-1 bg-slate-100/80 p-1 rounded-xl w-fit shadow-inner">
          <button
            onClick={() => setMainTab('users')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              mainTab === 'users'
                ? 'bg-white text-[#1B3A6B] shadow-xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <Users size={15} />
            <span>Danh Sách Nhân Viên</span>
          </button>
          <button
            onClick={() => setMainTab('permissions')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              mainTab === 'permissions'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            <Shield size={15} />
            <span>Phân Bổ Quyền (Matrix)</span>
          </button>
        </div>
      )}

      {mainTab === 'permissions' && currentUser?.role === 'ADMIN' ? (
        <PermissionMatrix />
      ) : (
        <>

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[#1B3A6B]" />
            <span className="font-bold text-[#1B3A6B] text-sm tracking-tight">Bộ Lọc Tìm Kiếm</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200/70 px-2.5 py-1 rounded-lg font-medium">
              Hiển thị <strong className="text-slate-800 font-bold">{filteredUsers.length}</strong> / {users.length} nhân viên
            </span>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
              >
                <X size={13} /> Xóa bộ lọc
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              className="form-input w-full pl-9 pr-8 text-xs py-2 rounded-xl border border-slate-200 focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B] transition-all"
              placeholder="Tìm theo tên, SĐT, username..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Main Station */}
          <select
            className="form-input bg-white text-xs py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-medium focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B] cursor-pointer"
            value={filterMainStation}
            onChange={e => { setFilterMainStation(e.target.value); setFilterTechStation(''); }}
          >
            <option value="">Tất cả trạm chính</option>
            {stations.map((main: any) => (
              <option key={main.id} value={main.id}>{main.name}</option>
            ))}
          </select>

          {/* Tech Station */}
          <select
            className="form-input bg-white text-xs py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-medium focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B] cursor-pointer"
            value={filterTechStation}
            onChange={e => setFilterTechStation(e.target.value)}
          >
            <option value="">Tất cả trạm kỹ thuật</option>
            {filteredTechStations.map(ts => (
              <option key={ts.id} value={ts.id}>{ts.name} ({ts.mainName})</option>
            ))}
          </select>

          {/* Status */}
          <select
            className="form-input bg-white text-xs py-2 px-3 rounded-xl border border-slate-200 text-slate-700 font-medium focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B] cursor-pointer"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </div>
      </div>

      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-[#1B3A6B] text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">
                {modalMode === 'create' ? 'Thêm Kỹ Thuật Viên Mới' : `Sửa Thông Tin KTV: ${fullName}`}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-white hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`flex-1 py-3 text-center font-semibold text-sm border-b-2 transition-all ${
                  activeTab === 'basic'
                    ? 'border-[#1B3A6B] text-[#1B3A6B] bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                1. Tài khoản & Trạm
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`flex-1 py-3 text-center font-semibold text-sm border-b-2 transition-all ${
                  activeTab === 'personal'
                    ? 'border-[#1B3A6B] text-[#1B3A6B] bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                2. Cá nhân & Thanh toán
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {error && <div className="alert alert-error">{error}</div>}

              {activeTab === 'basic' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Họ tên KTV *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Số điện thoại *</label>
                    <input
                      type="tel"
                      className="form-input"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Trạm trực thuộc (KTV)</label>
                    <select
                      className="form-input bg-white"
                      value={techStationId}
                      onChange={e => setTechStationId(e.target.value)}
                    >
                      <option value="">-- Chưa gán trạm --</option>
                      {stations.map(main => (
                        <optgroup key={main.id} label={main.name}>
                          {getSortedTechStations(main).map((tech: any) => (
                            <option key={tech.id} value={tech.id}>{main.name} | {tech.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Username đăng nhập *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">
                      {modalMode === 'create' ? 'Mật khẩu *' : 'Mật khẩu mới (để trống nếu giữ nguyên)'}
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required={modalMode === 'create'}
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Kho hàng tương ứng (Pancake POS)</label>
                    <select
                      className="form-input bg-white"
                      value={warehouseId}
                      onChange={handleWarehouseChange}
                    >
                      <option value="">-- Không gán kho / Chưa gán --</option>
                      {warehouses.map((w: any) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Vai trò *</label>
                    <select
                      className="form-input bg-white"
                      value={role}
                      onChange={e => setRole(e.target.value as any)}
                      disabled={currentUser?.role !== 'ADMIN'}
                      required
                    >
                      <option value="KTV">Kỹ thuật viên (KTV)</option>
                      <option value="ADMIN">Quản trị viên (ADMIN)</option>
                      <option value="DEV">Lập trình viên (DEV)</option>
                      <option value="SALE_SUPERVISOR">Sale Supervisor</option>
                      <option value="SALER">Saler</option>
                      <option value="HOTLINE">Hotline</option>
                      <option value="COORDINATOR">Điều phối viên (Coordinator)</option>
                      <option value="STAFF">Nhân viên (Staff)</option>
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Nhóm công việc (Group)</label>
                    <select
                      className="form-input bg-white cursor-pointer"
                      value={selectedGroupOption}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedGroupOption(val);
                        if (val === 'OTHER') {
                          setGroup(customGroup);
                        } else {
                          setGroup(val);
                        }
                      }}
                    >
                      <option value="">-- Chưa chọn nhóm --</option>
                      {PREDEFINED_GROUPS.map((g: string) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="OTHER">-- Khác (Gõ nhóm mới...) --</option>
                    </select>
                    {selectedGroupOption === 'OTHER' && (
                      <input
                        type="text"
                        className="form-input mt-2"
                        value={customGroup}
                        onChange={e => {
                          setCustomGroup(e.target.value);
                          setGroup(e.target.value);
                        }}
                        placeholder="Nhập tên nhóm công việc khác..."
                        autoFocus
                      />
                    )}
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Tên account Pancake</label>
                    <input
                      type="text"
                      className="form-input"
                      value={pancakeAccountName}
                      onChange={e => setPancakeAccountName(e.target.value)}
                      placeholder="Nhập tên tài khoản Pancake"
                    />
                  </div>
                  {modalMode === 'edit' && (
                    <div className="form-group mb-0">
                      <label className="form-label text-xs font-semibold text-gray-700">Trạng thái hoạt động</label>
                      <select
                        className="form-input bg-white"
                        value={isActive ? 'true' : 'false'}
                        onChange={e => setIsActive(e.target.value === 'true')}
                      >
                        <option value="true">Hoạt động</option>
                        <option value="false">Đã khóa</option>
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="animate-fade-in">
                  <div className="form-group mb-0" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label text-xs font-semibold text-gray-700">Địa chỉ liên hệ</label>
                    <input
                      type="text"
                      className="form-input"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP"
                    />
                  </div>
                  <div className="form-group mb-0" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label text-xs font-semibold text-gray-700">Email liên hệ</label>
                    <input
                      type="email"
                      className="form-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Số CCCD</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cccdNumber}
                      onChange={e => setCccdNumber(e.target.value)}
                      placeholder="Số CCCD"
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Ngày cấp CCCD</label>
                    <input
                      type="date"
                      className="form-input"
                      value={cccdDate}
                      onChange={e => setCccdDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group mb-0" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label text-xs font-semibold text-gray-700">Nơi cấp CCCD</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cccdPlace}
                      onChange={e => setCccdPlace(e.target.value)}
                      placeholder="Ví dụ: Cục Cảnh sát QLHC về trật tự xã hội"
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Số tài khoản thanh toán</label>
                    <input
                      type="text"
                      className="form-input"
                      value={bankAccount}
                      onChange={e => setBankAccount(e.target.value)}
                      placeholder="Số tài khoản thanh toán"
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-xs font-semibold text-gray-700">Ngân hàng thanh toán</label>
                    <input
                      type="text"
                      className="form-input"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      placeholder="Tên ngân hàng (ví dụ: Vietcombank)"
                    />
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'create' ? 'Tạo KTV' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Scope Confirmation Modal (OVERWRITE vs FUTURE_ONLY) */}
      {scopeModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden flex flex-col animate-scale-up text-left">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                  <ShieldCheck size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Xác nhận phạm vi thay đổi</h3>
                  <p className="text-xs text-blue-100 mt-0.5">Lựa chọn cách hệ thống đồng bộ dữ liệu lịch sử</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setScopeModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Comparison Box */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-gray-700 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">Thông tin ban đầu:</span>
                  <span className="font-bold text-gray-800">{originalUser?.fullName} <span className="font-mono text-gray-500">(@{originalUser?.username})</span></span>
                </div>
                <div className="h-px bg-slate-200" />
                <div className="flex items-center justify-between">
                  <span className="text-blue-600 font-semibold">Thay đổi thành:</span>
                  <span className="font-bold text-blue-700">{fullName} <span className="font-mono text-blue-600">(@{username})</span></span>
                </div>
              </div>

              <div className="text-xs font-semibold text-gray-700">Vui lòng chọn 1 trong 2 phương án bên dưới:</div>

              {/* 2 Options Cards */}
              <div className="space-y-3">
                {/* Option 1: OVERWRITE */}
                <label 
                  onClick={() => setApplyScopeChoice('OVERWRITE')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    applyScopeChoice === 'OVERWRITE'
                      ? 'border-[#2563EB] bg-blue-50/50 shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="applyScope"
                    checked={applyScopeChoice === 'OVERWRITE'}
                    onChange={() => setApplyScopeChoice('OVERWRITE')}
                    className="mt-0.5 accent-[#2563EB]"
                  />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-gray-900">
                      <RefreshCw size={14} className="text-blue-600" />
                      <span>Cập nhật đè lên toàn bộ lịch sử (Overwrite)</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                      Đổi trực tiếp trên tài khoản này. Toàn bộ đơn hàng, báo cáo dịch vụ và lịch sử làm việc từ trước tới nay sẽ tự động hiển thị theo thông tin mới.
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Phù hợp khi: Sửa lỗi chính tả tên hoặc bàn giao toàn bộ lịch sử cho người mới
                    </span>
                  </div>
                </label>

                {/* Option 2: FUTURE_ONLY */}
                <label 
                  onClick={() => setApplyScopeChoice('FUTURE_ONLY')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    applyScopeChoice === 'FUTURE_ONLY'
                      ? 'border-[#1B3A6B] bg-indigo-50/50 shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="applyScope"
                    checked={applyScopeChoice === 'FUTURE_ONLY'}
                    onChange={() => setApplyScopeChoice('FUTURE_ONLY')}
                    className="mt-0.5 accent-[#1B3A6B]"
                  />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-gray-900">
                      <ShieldCheck size={14} className="text-[#1B3A6B]" />
                      <span>Chỉ áp dụng cho các dữ liệu về sau (Tách dữ liệu)</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                      Bảo toàn nguyên vẹn lịch sử & tài khoản cũ của <strong>{originalUser?.fullName}</strong>. Hệ thống sẽ tạo tài khoản KTV mới cho <strong>{fullName}</strong> và chuyển giao các đơn đang thực hiện sang nhân sự mới.
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Phù hợp khi: Thay KTV mới nhưng muốn giữ đúng sổ sách, báo cáo cũ của người trước
                    </span>
                  </div>
                </label>
              </div>

              {error && <div className="alert alert-error text-xs py-2">{error}</div>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button 
                type="button" 
                disabled={submittingScope}
                onClick={() => setScopeModalOpen(false)} 
                className="btn btn-outline text-xs px-4 py-2"
              >
                Hủy
              </button>
              <button 
                type="button" 
                disabled={submittingScope}
                onClick={() => executeSave(applyScopeChoice)} 
                className="btn btn-primary text-xs px-5 py-2 flex items-center gap-2"
              >
                {submittingScope ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <span>Xác nhận & Áp dụng</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {loading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <Loader2 size={32} className="animate-spin text-[#1B3A6B] mx-auto mb-2.5" />
          <p className="text-xs font-semibold text-slate-500">Đang tải danh sách nhân viên...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
              <Users size={36} className="text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-700">Không tìm thấy nhân viên</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {hasFilters ? 'Không có nhân sự nào khớp với điều kiện lọc hiện tại. Thử xóa hoặc thay đổi bộ lọc.' : 'Chưa có nhân viên nào trong hệ thống.'}
              </p>
              {hasFilters && (
                <button 
                  onClick={clearFilters}
                  className="mt-4 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#1B3A6B] bg-slate-100 hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <X size={13} /> Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            filteredUsers.map(u => (
              <div 
                key={u.id} 
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-200 transition-all duration-200 p-4 sm:p-5 flex flex-col gap-4 text-left group"
              >
                {/* Top Row: Avatar, Main Info & Metrics */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Avatar + Identity */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-[#1B3A6B] font-bold text-xs flex items-center justify-center border border-slate-200/80 shrink-0 shadow-2xs group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                      {getInitials(u.fullName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-base leading-snug group-hover:text-[#1B3A6B] transition-colors">
                          {u.fullName}
                        </h4>
                        {(() => {
                          const rBadge = getRoleBadge(u.role);
                          return (
                            <span className={`px-2 py-0.5 text-[10px] rounded-md font-bold uppercase tracking-wide border ${rBadge.className}`}>
                              {rBadge.label}
                            </span>
                          );
                        })()}
                        
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Đã khóa
                          </span>
                        )}
                      </div>
                      
                      {/* Contact info chips */}
                      <div className="flex items-center gap-x-4 gap-y-1.5 mt-2 flex-wrap text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-400 shrink-0" />
                          {u.phoneNumber ? (
                            <a href={`tel:${u.phoneNumber}`} className="font-semibold text-slate-700 hover:text-blue-600 hover:underline">
                              {u.phoneNumber}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Chưa có SĐT</span>
                          )}
                        </div>
                        {u.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail size={13} className="text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700 truncate max-w-[220px]" title={u.email}>{u.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700 select-all border border-slate-200/60">
                            {u.username}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics stats cluster */}
                  <div className="flex items-center gap-2 self-start lg:self-center flex-wrap">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-right min-w-[80px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nhóm</span>
                      <span className="text-xs font-semibold text-slate-800">{u.group || '---'}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-right min-w-[90px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Báo cáo</span>
                      <span className="text-xs font-bold text-slate-900">{u._count?.serviceReports || 0} ca</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-right min-w-[110px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account POS</span>
                      <span className="text-xs font-semibold text-slate-800 truncate block max-w-[120px]" title={u.pancakeAccountName || '---'}>
                        {u.pancakeAccountName || '---'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Station selection, Warehouse badge, and Action buttons */}
                <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  {/* Left: Station & Warehouse */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 flex-1">
                    {/* Trạm trực thuộc */}
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-slate-400 shrink-0" />
                      <span className="text-slate-500 font-semibold shrink-0">Trạm trực thuộc:</span>
                      {u.role !== 'KTV' ? (
                        <span className="text-slate-400 italic">Không áp dụng trạm</span>
                      ) : (
                        <select 
                          className="form-input bg-white text-xs py-1.5 px-3 h-auto w-full sm:w-[280px] border-slate-200 focus:border-[#1B3A6B] rounded-lg cursor-pointer font-medium text-slate-800 shadow-2xs"
                          value={u.techStationId || ''}
                          onChange={(e) => handleChangeStation(u.id, e.target.value)}
                        >
                          <option value="">-- Chưa gán trạm --</option>
                          {stations.map(main => (
                            <optgroup key={main.id} label={main.name}>
                              {getSortedTechStations(main).map((tech: any) => (
                                <option key={tech.id} value={tech.id}>{main.name} | {tech.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Kho Pancake POS */}
                    {u.warehouseName && (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-blue-800 font-semibold bg-blue-50/80 border border-blue-200/80 px-2.5 py-1 rounded-lg">
                          <Package size={13} className="text-blue-600" />
                          <span className="text-slate-500 font-normal">Kho POS:</span>
                          <span>{u.warehouseName}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  {u.role !== 'ADMIN' && (
                    <div className="flex items-center justify-end gap-2 shrink-0 border-t md:border-t-0 pt-2 md:pt-0">
                      <button 
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all cursor-pointer shadow-2xs"
                        title="Chỉnh sửa thông tin"
                      >
                        <Pencil size={13} className="text-slate-500" />
                        <span>Sửa</span>
                      </button>
                      <button 
                        onClick={() => toggleActive(u.id, u.isActive)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                          u.isActive 
                            ? 'text-rose-700 hover:text-rose-800 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300' 
                            : 'text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300'
                        }`}
                        title={u.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      >
                        {u.isActive ? <Lock size={13} /> : <Unlock size={13} />}
                        <span>{u.isActive ? 'Khóa' : 'Mở khóa'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
