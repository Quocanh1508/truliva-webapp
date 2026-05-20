import React, { useEffect, useState } from 'react';
import { fetchApi, getStations } from '../../api/client';
import { UserPlus, Lock, Unlock, KeyRound } from 'lucide-react';

export default function UserManage() {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [techStationId, setTechStationId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
    getStations().then(setStations).catch(console.error);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await fetchApi('/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, fullName, phoneNumber: phone, role: 'KTV', techStationId })
      });
      setShowCreate(false);
      setUsername(''); setPassword(''); setFullName(''); setPhone(''); setTechStationId('');
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    if (!window.confirm(`Bạn muốn ${current ? 'Khóa' : 'Mở khóa'} tài khoản này?`)) return;
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

  const resetPassword = async (id: string, name: string) => {
    const newPassword = window.prompt(
      `Đặt lại mật khẩu cho KTV "${name}"\nNhập mật khẩu mới (để trống = Truliva@2025):`
    );
    if (newPassword === null) return; // User cancelled
    const passwordToSet = newPassword.trim() || 'Truliva@2025';
    try {
      await fetchApi(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: passwordToSet })
      });
      alert(`Đã đặt lại mật khẩu cho "${name}" thành công!`);
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
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

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B]">Quản lý Kỹ Thuật Viên</h2>
        <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowCreate(!showCreate)}>
          <UserPlus size={18} /> Thêm KTV
        </button>
      </div>

      {showCreate && (
        <div className="card mb-8 animate-fade-in border-2 border-blue-100">
          <h3 className="font-bold mb-4">Tạo tài khoản KTV mới</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group mb-0">
              <label className="form-label text-sm">Họ tên KTV *</label>
              <input type="text" className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-sm">Số điện thoại</label>
              <input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-sm">Trạm trực thuộc (KTV)</label>
              <select className="form-input bg-white" value={techStationId} onChange={e => setTechStationId(e.target.value)}>
                <option value="">-- Chưa gán trạm --</option>
                {stations.map(main => (
                  <optgroup key={main.id} label={main.name}>
                    {main.techStations?.map((tech: any) => (
                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-sm">Username đăng nhập *</label>
              <input type="text" className="form-input" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-sm">Mật khẩu *</label>
              <input type="text" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Tạo tài khoản</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>
      ) : (
        <div className="card table-container" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px' }}>Họ tên / SĐT</th>
                <th style={{ padding: '12px 16px' }}>Username</th>
                <th style={{ padding: '12px 16px' }}>Vai trò</th>
                <th style={{ padding: '12px 16px' }}>Trạm trực thuộc</th>
                <th style={{ padding: '12px 16px' }}>Số báo cáo</th>
                <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="hover:bg-gray-50">
                  <td style={{ padding: '12px 16px' }}>
                    <div className="font-bold">{u.fullName}</div>
                    <div className="text-xs text-gray-500">{u.phoneNumber || '---'}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{u.username}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`px-2 py-1 text-xs rounded font-bold ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.role === 'ADMIN' ? (
                      <span className="text-gray-400 italic text-sm">Không áp dụng</span>
                    ) : (
                      <select 
                        className="form-input bg-white text-sm py-1 px-2 h-auto"
                        value={u.techStationId || ''}
                        onChange={(e) => handleChangeStation(u.id, e.target.value)}
                      >
                        <option value="">-- Chưa gán trạm --</option>
                        {stations.map(main => (
                          <optgroup key={main.id} label={main.name}>
                            {main.techStations?.map((tech: any) => (
                              <option key={tech.id} value={tech.id}>{tech.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{u._count.serviceReports}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.isActive ? <span className="text-green-600 font-bold text-sm">Hoạt động</span> : <span className="text-red-600 font-bold text-sm">Đã khóa</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.role !== 'ADMIN' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => toggleActive(u.id, u.isActive)}
                          className={`p-2 rounded text-sm ${u.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                          title={u.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                        >
                          {u.isActive ? <Lock size={18} /> : <Unlock size={18} />}
                        </button>
                        <button 
                          onClick={() => resetPassword(u.id, u.fullName)}
                          className="p-2 rounded text-sm text-amber-600 hover:bg-amber-50"
                          title="Đặt lại mật khẩu"
                        >
                          <KeyRound size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
