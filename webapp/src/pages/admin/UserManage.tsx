import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchApi, getStations } from '../../api/client';
import { UserPlus, Lock, Unlock, Search, Filter, X, Pencil, Download } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { matchesSearchTerm } from '../../utils/text';
import { useAuth, type UserRole } from '../../context/AuthContext';

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
  const [pancakeAccountName, setPancakeAccountName] = useState('');
  
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterMainStation, setFilterMainStation] = useState('');
  const [filterTechStation, setFilterTechStation] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

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
    setPancakeAccountName('');
    setIsActive(true);
    setActiveTab('basic');
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setModalMode('edit');
    setEditingUserId(user.id);
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
    setGroup(user.group || '');
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
      setUsers(data.users);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify({
            username, password, fullName, phoneNumber: phone, role, techStationId,
            address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
            warehouseId, warehouseName, group, pancakeAccountName
          })
        });
      } else {
        await fetchApi(`/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName, phoneNumber: phone, role, techStationId, isActive,
            password: password.trim() || undefined,
            address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
            warehouseId, warehouseName, group, pancakeAccountName
          })
        });
      }
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setError(err.message);
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
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B]">Quản Lí Nhân Viên</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-outline flex items-center gap-2" onClick={handleExportExcel} title="Xuất file Excel theo bộ lọc">
            <Download size={18} /> Xuất Excel
          </button>
          <button className="btn btn-primary flex items-center gap-2" onClick={openCreateModal}>
            <UserPlus size={18} /> Thêm KTV
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="card mb-6" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Filter size={18} style={{ color: '#1B3A6B' }} />
          <span style={{ fontWeight: 600, color: '#1B3A6B', fontSize: '14px' }}>Bộ lọc</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', cursor: 'pointer'
              }}
            >
              <X size={14} /> Xóa bộ lọc
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Tìm theo tên, SĐT, username..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '13px' }}
            />
          </div>

          {/* Main Station */}
          <select
            className="form-input bg-white"
            value={filterMainStation}
            onChange={e => { setFilterMainStation(e.target.value); setFilterTechStation(''); }}
            style={{ fontSize: '13px' }}
          >
            <option value="">Tất cả trạm chính</option>
            {stations.map((main: any) => (
              <option key={main.id} value={main.id}>{main.name}</option>
            ))}
          </select>

          {/* Tech Station */}
          <select
            className="form-input bg-white"
            value={filterTechStation}
            onChange={e => setFilterTechStation(e.target.value)}
            style={{ fontSize: '13px' }}
          >
            <option value="">Tất cả trạm kỹ thuật</option>
            {filteredTechStations.map(ts => (
              <option key={ts.id} value={ts.id}>{ts.name} ({ts.mainName})</option>
            ))}
          </select>

          {/* Status */}
          <select
            className="form-input bg-white"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            style={{ fontSize: '13px' }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </div>

        {/* Result count */}
        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Hiển thị <strong>{filteredUsers.length}</strong> / {users.length} kỹ thuật viên
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
                      disabled={modalMode === 'edit'}
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
                    <input
                      type="text"
                      className="form-input"
                      value={group}
                      onChange={e => setGroup(e.target.value)}
                      placeholder="Ví dụ: DTC, eCom, Service, Marketing"
                    />
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

      {loading ? (
        <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
              {hasFilters ? 'Không tìm thấy kỹ thuật viên phù hợp với bộ lọc.' : 'Chưa có kỹ thuật viên nào.'}
            </div>
          ) : (
            filteredUsers.map(u => (
              <div 
                key={u.id} 
                className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col justify-between min-h-[250px] relative text-left"
              >
                <div>
                  {/* Header: Name, Status & Role */}
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div>
                      <h4 className="font-bold text-gray-900 text-[16px] leading-snug">{u.fullName}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{u.phoneNumber || 'Không có SĐT'}</p>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 text-[10px] rounded-md font-bold uppercase ${
                        u.role === 'ADMIN' ? 'bg-red-100 text-red-700' :
                        u.role === 'COORDINATOR' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'SALE_SUPERVISOR' ? 'bg-amber-100 text-amber-700' :
                        u.role === 'SALER' ? 'bg-green-100 text-green-700' :
                        u.role === 'HOTLINE' ? 'bg-pink-100 text-pink-700' :
                        u.role === 'STAFF' ? 'bg-teal-100 text-teal-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                      
                      {/* Status dot */}
                      <span className="relative flex h-2.5 w-2.5" title={u.isActive ? "Hoạt động" : "Đã khóa"}>
                        {u.isActive ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                          </>
                        ) : (
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Main content info */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-gray-600 border-t border-gray-100 pt-3 mb-4">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Username</span>
                      <span className="font-medium text-gray-800">{u.username}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Nhóm</span>
                      <span className="font-medium text-gray-800">{u.group || '---'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Account Pancake</span>
                      <span className="font-medium text-gray-800">{u.pancakeAccountName || '---'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Báo cáo gửi</span>
                      <span className="font-bold text-gray-900">{u._count.serviceReports} báo cáo</span>
                    </div>
                    {u.warehouseName && (
                      <div className="col-span-2 mt-1">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-700 font-bold bg-blue-50/80 border border-blue-100 px-2 py-0.5 rounded-md">
                          📦 Kho: {u.warehouseName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Station select & actions */}
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-3 mt-auto">
                  <div className="flex-1">
                    {u.role !== 'KTV' ? (
                      <span className="text-gray-400 italic text-xs">Không áp dụng trạm</span>
                    ) : (
                      <div className="w-full">
                        <span className="text-gray-400 block text-[10px] uppercase font-semibold mb-0.5">Trạm trực thuộc</span>
                        <select 
                          className="form-input bg-white text-xs py-1.5 px-2.5 h-auto w-full border-gray-200 focus:border-blue-500 rounded-md"
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
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-3 shrink-0">
                    {u.role !== 'ADMIN' && (
                      <>
                        <button 
                          onClick={() => openEditModal(u)}
                          className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors"
                          title="Chỉnh sửa thông tin"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={() => toggleActive(u.id, u.isActive)}
                          className={`p-1.5 rounded-md border border-transparent transition-colors ${
                            u.isActive 
                              ? 'text-red-600 hover:bg-red-50' 
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={u.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                        >
                          {u.isActive ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
