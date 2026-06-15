import React, { useEffect, useState, useRef, useMemo } from 'react';
import { fetchApi, getStations } from '../../api/client';
import { 
  Building2, 
  MapPin, 
  Users2, 
  Search, 
  User, 
  Phone, 
  Briefcase, 
  Activity, 
  FileSpreadsheet, 
  X,
  ChevronRight,
  Warehouse
} from 'lucide-react';

interface MainStation {
  id: string;
  name: string;
  isActive: boolean;
  techStations: TechStation[];
}

interface TechStation {
  id: string;
  name: string;
  mainStationId: string;
  isActive: boolean;
}

interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
  role: string;
  group?: string;
  pancakeAccountName?: string;
  techStationId?: string;
  warehouseName?: string;
  isActive: boolean;
  _count?: {
    serviceReports: number;
  };
}

export default function SystemMap() {
  const [stations, setStations] = useState<MainStation[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Selections
  const [selectedMainId, setSelectedMainId] = useState<string | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drawer Detail Node
  const [detailNode, setDetailNode] = useState<{
    type: 'main' | 'tech' | 'user';
    data: any;
  } | null>(null);

  // SVG Coordinates state
  const [coords, setCoords] = useState<Record<string, any>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch database stations and users
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const stationsData = await getStations();
        const usersData = await fetchApi('/users');
        setStations(stationsData);
        setUsers(usersData.users || []);
        
        // Default select the first main station
        if (stationsData.length > 0) {
          setSelectedMainId(stationsData[0].id);
          // Default select the first tech station of the first main station if available
          if (stationsData[0].techStations && stationsData[0].techStations.length > 0) {
            setSelectedTechId(stationsData[0].techStations[0].id);
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu sơ đồ hệ thống:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter main stations, tech stations, and users based on search
  const filteredMainStations = useMemo(() => {
    if (!searchTerm.trim()) return stations;
    const term = searchTerm.toLowerCase();
    
    return stations.filter(main => {
      const matchName = main.name.toLowerCase().includes(term);
      const matchTechs = main.techStations.some(tech => tech.name.toLowerCase().includes(term));
      const matchUsers = users.some(u => {
        const isAssociated = u.techStationId 
          ? main.techStations.some(t => t.id === u.techStationId)
          : main.name.toLowerCase() === 'truliva'; // Office users associated to main Truliva station
        return isAssociated && u.fullName.toLowerCase().includes(term);
      });
      return matchName || matchTechs || matchUsers;
    });
  }, [stations, users, searchTerm]);

  // Current active main station
  const currentMain = useMemo(() => {
    return stations.find(m => m.id === selectedMainId) || null;
  }, [stations, selectedMainId]);

  // Get active tech stations including virtual "Office & Coordinator" node for non-KTVs
  const currentTechStations = useMemo(() => {
    if (!currentMain) return [];
    const baseTechs = [...currentMain.techStations];
    
    // Inject a virtual office tech station if there are office users belonging to this main station
    // Admin, coordinator, hotlines, etc. go to "Văn phòng Điều phối"
    const hasOfficeUsers = users.some(u => u.role !== 'KTV' && currentMain.name.toLowerCase() === 'truliva');
    
    if (hasOfficeUsers && currentMain.name.toLowerCase() === 'truliva') {
      baseTechs.unshift({
        id: 'virtual-office-station',
        name: 'Văn phòng Điều phối',
        mainStationId: currentMain.id,
        isActive: true
      });
    }
    
    return baseTechs;
  }, [currentMain, users]);

  // Personnel under the selected tech station
  const currentPersonnel = useMemo(() => {
    if (!selectedTechId) return [];
    
    if (selectedTechId === 'virtual-office-station') {
      // Return all non-KTV office users
      return users.filter(u => u.role !== 'KTV');
    }
    
    // Return KTVs assigned to this tech station
    return users.filter(u => u.techStationId === selectedTechId);
  }, [selectedTechId, users]);

  // Update SVG connections coordinates
  const updateCoords = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newCoords: Record<string, any> = {};

    const elements = container.querySelectorAll('[id^="node-"]');
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left - containerRect.left;
      const y = rect.top - containerRect.top;
      const w = rect.width;
      const h = rect.height;

      newCoords[el.id] = {
        left: x,
        right: x + w,
        top: y,
        bottom: y + h,
        centerY: y + h / 2,
        centerX: x + w / 2
      };
    });
    setCoords(newCoords);
  };

  // Recalculate coordinates when elements render or change
  useEffect(() => {
    if (loading) return;
    
    // Run after DOM has updated layout
    const timer = setTimeout(() => {
      updateCoords();
    }, 150);

    window.addEventListener('resize', updateCoords);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoords);
    };
  }, [loading, selectedMainId, selectedTechId, currentTechStations, currentPersonnel, searchTerm]);

  // Handle Main Station click
  const handleMainClick = (mainId: string) => {
    setSelectedMainId(mainId);
    
    // Select first tech station automatically
    const main = stations.find(m => m.id === mainId);
    if (main) {
      const isTruliva = main.name.toLowerCase() === 'truliva';
      if (isTruliva) {
        setSelectedTechId('virtual-office-station');
      } else if (main.techStations && main.techStations.length > 0) {
        setSelectedTechId(main.techStations[0].id);
      } else {
        setSelectedTechId(null);
      }
    }
    setSelectedUserId(null);
  };

  // Handle Tech Station click
  const handleTechClick = (techId: string) => {
    setSelectedTechId(techId);
    setSelectedUserId(null);
  };

  // Handle User click
  const handleUserClick = (user: UserProfile) => {
    setSelectedUserId(user.id);
    setDetailNode({
      type: 'user',
      data: user
    });
  };

  // Handle open details for Main Station
  const handleMainDetail = (main: MainStation, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetailNode({
      type: 'main',
      data: main
    });
  };

  // Handle open details for Tech Station
  const handleTechDetail = (tech: TechStation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    let dbTech = tech;
    if (tech.id === 'virtual-office-station') {
      dbTech = {
        id: 'virtual-office-station',
        name: 'Văn phòng Điều phối Truliva',
        mainStationId: selectedMainId || '',
        isActive: true
      };
    }
    
    setDetailNode({
      type: 'tech',
      data: dbTech
    });
  };

  // Render curved bezier links between columns
  const svgConnections = useMemo(() => {
    if (Object.keys(coords).length === 0) return null;
    const paths: React.ReactNode[] = [];

    // 1. Draw connections from selected Main Station to its Tech Stations
    if (selectedMainId && coords[`node-main-${selectedMainId}`]) {
      const mainCoord = coords[`node-main-${selectedMainId}`];
      
      currentTechStations.forEach(tech => {
        const techCoord = coords[`node-tech-${tech.id}`];
        if (techCoord) {
          const startX = mainCoord.right;
          const startY = mainCoord.centerY;
          const endX = techCoord.left;
          const endY = techCoord.centerY;
          
          const dx = Math.abs(endX - startX) * 0.45;
          const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
          
          const isActivePath = selectedTechId === tech.id;
          
          paths.push(
            <g key={`link-main-tech-${tech.id}`}>
              {/* Glow effect for active line */}
              {isActivePath && (
                <path 
                  d={pathD} 
                  stroke="#3b82f6" 
                  strokeWidth="6" 
                  fill="none" 
                  opacity="0.25" 
                  style={{ filter: 'blur(3px)' }}
                />
              )}
              {/* Core line */}
              <path 
                d={pathD} 
                stroke={isActivePath ? '#2563eb' : '#cbd5e1'} 
                strokeWidth={isActivePath ? '2.5' : '1.5'} 
                fill="none" 
                opacity={isActivePath ? '1' : '0.5'}
                className={isActivePath ? 'flow-line' : ''}
                strokeDasharray={isActivePath ? '6 4' : undefined}
                style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
              />
            </g>
          );
        }
      });
    }

    // 2. Draw connections from active Tech Station to its Personnel
    if (selectedTechId && coords[`node-tech-${selectedTechId}`]) {
      const techCoord = coords[`node-tech-${selectedTechId}`];
      
      currentPersonnel.forEach(user => {
        const userCoord = coords[`node-user-${user.id}`];
        if (userCoord) {
          const startX = techCoord.right;
          const startY = techCoord.centerY;
          const endX = userCoord.left;
          const endY = userCoord.centerY;
          
          const dx = Math.abs(endX - startX) * 0.45;
          const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
          
          const isUserSelected = selectedUserId === user.id;
          
          paths.push(
            <g key={`link-tech-user-${user.id}`}>
              {/* Glow effect for selected user line */}
              {isUserSelected && (
                <path 
                  d={pathD} 
                  stroke="#10b981" 
                  strokeWidth="6" 
                  fill="none" 
                  opacity="0.25" 
                  style={{ filter: 'blur(3px)' }}
                />
              )}
              {/* Core line */}
              <path 
                d={pathD} 
                stroke={isUserSelected ? '#059669' : '#3b82f6'} 
                strokeWidth={isUserSelected ? '2.5' : '1.5'} 
                fill="none" 
                opacity={isUserSelected ? '1' : '0.6'}
                className={isUserSelected ? 'flow-line-green' : 'flow-line'}
                strokeDasharray="6 4"
                style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
              />
            </g>
          );
        }
      });
    }

    return <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ zIndex: 0 }}>{paths}</svg>;
  }, [coords, selectedMainId, selectedTechId, selectedUserId, currentTechStations, currentPersonnel]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Self-contained premium animations */}
      <style>{`
        @keyframes flow {
          to {
            stroke-dashoffset: -20;
          }
        }
        .flow-line {
          animation: flow 1.2s linear infinite;
        }
        .flow-line-green {
          animation: flow 0.8s linear infinite;
        }
        .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(226, 232, 240, 0.8);
        }
        .node-active-blue {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
          background: #eff6ff;
        }
        .node-active-emerald {
          border-color: #10b981;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
          background: #ecfdf5;
        }
      `}</style>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border-b border-gray-200 gap-4">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B] flex items-center gap-2">
            <Activity size={24} className="text-blue-600 animate-pulse" />
            Sơ đồ mạng lưới hệ thống Truliva
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Mối liên kết trực quan giữa Trạm chính ➔ Trạm kỹ thuật ➔ Lực lượng kỹ thuật viên & Nhân sự
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="form-input w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border-gray-200 rounded-lg focus:bg-white transition-all"
            placeholder="Tìm kiếm trạm hoặc nhân viên..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <span className="spinner border-t-blue-600 w-10 h-10"></span>
        </div>
      ) : (
        <div className="flex-1 flex relative overflow-hidden">
          {/* Main Network Map Viewport */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-auto p-8 relative flex justify-between gap-12 select-none"
            style={{ minWidth: '960px' }}
          >
            {/* Draw SVG connections layer */}
            {svgConnections}

            {/* Column 1: Main Stations */}
            <div className="w-64 flex flex-col gap-4 relative z-10">
              <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <Building2 size={14} /> Trạm chính ({filteredMainStations.length})
              </div>
              <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
                {filteredMainStations.map(main => {
                  const isSelected = selectedMainId === main.id;
                  return (
                    <div
                      key={main.id}
                      id={`node-main-${main.id}`}
                      onClick={() => handleMainClick(main.id)}
                      className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected 
                          ? 'node-active-blue border-blue-500' 
                          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`px-2 py-0.5 text-[9px] rounded-md font-bold ${
                          main.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {main.isActive ? 'HOẠT ĐỘNG' : 'TẠM KHÓA'}
                        </span>
                        
                        <button
                          onClick={(e) => handleMainDetail(main, e)}
                          className="text-xs text-blue-600 hover:underline font-semibold"
                        >
                          Chi tiết
                        </button>
                      </div>
                      
                      <h4 className="font-bold text-gray-900 mt-2 text-sm truncate">{main.name}</h4>
                      
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2 border-t border-dashed border-gray-100">
                        <span>{main.techStations.length} Trạm con</span>
                        <ChevronRight size={14} className={isSelected ? 'text-blue-500' : 'text-gray-300'} />
                      </div>
                    </div>
                  );
                })}

                {filteredMainStations.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-xs italic bg-white border border-gray-150 rounded-xl">
                    Không tìm thấy trạm chính
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Tech Stations */}
            <div className="w-64 flex flex-col gap-4 relative z-10">
              <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <MapPin size={14} /> Trạm kỹ thuật ({currentTechStations.length})
              </div>
              <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
                {currentTechStations.map(tech => {
                  const isSelected = selectedTechId === tech.id;
                  const isVirtual = tech.id === 'virtual-office-station';
                  return (
                    <div
                      key={tech.id}
                      id={`node-tech-${tech.id}`}
                      onClick={() => handleTechClick(tech.id)}
                      className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected 
                          ? 'node-active-blue border-blue-500' 
                          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`px-2 py-0.5 text-[9px] rounded font-semibold ${
                          isVirtual ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {isVirtual ? 'VĂN PHÒNG' : 'TRẠM KTV'}
                        </span>
                        
                        <button
                          onClick={(e) => handleTechDetail(tech, e)}
                          className="text-xs text-blue-600 hover:underline font-semibold"
                        >
                          Chi tiết
                        </button>
                      </div>

                      <h4 className="font-bold text-gray-800 mt-2.5 text-xs line-clamp-2">{tech.name}</h4>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 mt-3 pt-2 border-t border-dashed border-gray-100">
                        <span>
                          {isVirtual 
                            ? `${users.filter(u => u.role !== 'KTV').length} Nhân sự`
                            : `${users.filter(u => u.techStationId === tech.id).length} KTV`
                          }
                        </span>
                        <ChevronRight size={14} className={isSelected ? 'text-blue-500' : 'text-gray-300'} />
                      </div>
                    </div>
                  );
                })}

                {currentTechStations.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-xs italic bg-white border border-gray-150 rounded-xl">
                    Hãy chọn một trạm chính
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Personnel */}
            <div className="w-64 flex flex-col gap-4 relative z-10">
              <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <Users2 size={14} /> Nhân sự ({currentPersonnel.length})
              </div>
              <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
                {currentPersonnel.map(user => {
                  const isSelected = selectedUserId === user.id;
                  return (
                    <div
                      key={user.id}
                      id={`node-user-${user.id}`}
                      onClick={() => handleUserClick(user)}
                      className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'node-active-emerald border-emerald-500' 
                          : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Status Dot */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          user.isActive ? 'bg-green-500 shadow-emerald-400 animate-pulse' : 'bg-red-500'
                        }`} />
                        
                        <div className="min-w-0">
                          <h5 className="font-bold text-gray-800 text-xs truncate">{user.fullName}</h5>
                          <p className="text-[10px] text-gray-400 truncate">{user.role} {user.group ? `• ${user.group}` : ''}</p>
                        </div>
                      </div>

                      <ChevronRight size={14} className={isSelected ? 'text-emerald-500' : 'text-gray-300'} />
                    </div>
                  );
                })}

                {currentPersonnel.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-xs italic bg-white border border-gray-150 rounded-xl">
                    Không có nhân sự nào trực thuộc
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Slide-out Drawer Panel for Node Details */}
          {detailNode && (
            <div className="w-96 border-l border-gray-200 bg-white shadow-2xl flex flex-col z-20 animate-fade-in relative">
              {/* Drawer Header */}
              <div className="p-5 bg-slate-50 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {detailNode.type === 'main' && <Building2 className="text-blue-600" size={20} />}
                  {detailNode.type === 'tech' && <MapPin className="text-blue-500" size={20} />}
                  {detailNode.type === 'user' && <User className="text-emerald-600" size={20} />}
                  <h3 className="font-bold text-gray-800 text-sm">
                    {detailNode.type === 'main' && 'Thông tin Trạm chính'}
                    {detailNode.type === 'tech' && 'Thông tin Trạm kỹ thuật'}
                    {detailNode.type === 'user' && 'Chi tiết nhân sự'}
                  </h3>
                </div>
                
                <button 
                  onClick={() => setDetailNode(null)} 
                  className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 text-left">
                {/* 1. Main Station Details */}
                {detailNode.type === 'main' && (
                  <>
                    <div>
                      <h4 className="font-black text-xl text-gray-900 leading-tight">{detailNode.data.name}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md ${
                          detailNode.data.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {detailNode.data.isActive ? 'Hoạt động' : 'Tạm khóa'}
                        </span>
                        <span className="text-xs text-gray-400">ID: {detailNode.data.id}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Số trạm con trực thuộc:</span>
                        <span className="font-bold text-gray-800">{detailNode.data.techStations?.length || 0} trạm</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Tổng nhân sự hệ thống:</span>
                        <span className="font-bold text-gray-800">
                          {users.filter(u => u.techStationId && detailNode.data.techStations.some((ts: any) => ts.id === u.techStationId)).length + (detailNode.data.name.toLowerCase() === 'truliva' ? users.filter(u => u.role !== 'KTV').length : 0)} người
                        </span>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">Danh sách trạm kỹ thuật:</h5>
                      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                        {detailNode.data.techStations?.map((ts: any) => (
                          <div 
                            key={ts.id}
                            onClick={() => {
                              setSelectedTechId(ts.id);
                              setDetailNode({ type: 'tech', data: ts });
                            }}
                            className="p-2.5 rounded-lg border border-gray-100 hover:border-blue-300 bg-white cursor-pointer transition-colors flex justify-between items-center text-xs"
                          >
                            <span className="font-semibold text-gray-700">{ts.name}</span>
                            <span className="text-gray-400 text-[10px]">
                              {users.filter(u => u.techStationId === ts.id).length} KTV
                            </span>
                          </div>
                        ))}
                        {(!detailNode.data.techStations || detailNode.data.techStations.length === 0) && (
                          <div className="text-center text-gray-400 text-xs italic py-3 bg-slate-50 rounded-lg">
                            Không có trạm kỹ thuật nào
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Tech Station Details */}
                {detailNode.type === 'tech' && (
                  <>
                    <div>
                      <h4 className="font-black text-xl text-gray-900 leading-tight">{detailNode.data.name}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md ${
                          detailNode.data.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {detailNode.data.isActive ? 'Hoạt động' : 'Đã khóa'}
                        </span>
                        <span className="text-xs text-gray-400">ID: {detailNode.data.id}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Trạm chính quản lý:</span>
                        <span className="font-bold text-blue-700">
                          {stations.find(m => m.id === detailNode.data.mainStationId)?.name || 'Truliva'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Số lượng nhân sự gán:</span>
                        <span className="font-bold text-gray-800">
                          {detailNode.data.id === 'virtual-office-station' 
                            ? users.filter(u => u.role !== 'KTV').length
                            : users.filter(u => u.techStationId === detailNode.data.id).length
                          } người
                        </span>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">
                        {detailNode.data.id === 'virtual-office-station' ? 'Thành viên văn phòng:' : 'Kỹ thuật viên phụ trách:'}
                      </h5>
                      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                        {(detailNode.data.id === 'virtual-office-station'
                          ? users.filter(u => u.role !== 'KTV')
                          : users.filter(u => u.techStationId === detailNode.data.id)
                        ).map((u) => (
                          <div 
                            key={u.id}
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setDetailNode({ type: 'user', data: u });
                            }}
                            className="p-2.5 rounded-lg border border-gray-100 hover:border-emerald-300 bg-white cursor-pointer transition-colors flex justify-between items-center text-xs"
                          >
                            <div>
                              <div className="font-semibold text-gray-700">{u.fullName}</div>
                              <div className="text-[10px] text-gray-400">{u.role}</div>
                            </div>
                            <span className="text-[10px] bg-slate-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                              {u.username}
                            </span>
                          </div>
                        ))}
                        {((detailNode.data.id === 'virtual-office-station'
                          ? users.filter(u => u.role !== 'KTV')
                          : users.filter(u => u.techStationId === detailNode.data.id)
                        ).length === 0) && (
                          <div className="text-center text-gray-400 text-xs italic py-3 bg-slate-50 rounded-lg">
                            Chưa gán nhân viên nào
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* 3. User Details */}
                {detailNode.type === 'user' && (
                  <>
                    <div className="flex items-start gap-4">
                      {/* Avatar placeholder with role letter */}
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white text-2xl font-black shadow-md shrink-0">
                        {detailNode.data.fullName[0].toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-black text-lg text-gray-900 leading-tight truncate">{detailNode.data.fullName}</h4>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${detailNode.data.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                          {detailNode.data.isActive ? 'Hoạt động' : 'Tài khoản khóa'}
                        </p>
                        <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {detailNode.data.role}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3.5 border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-3 text-xs text-gray-700">
                        <Phone size={16} className="text-gray-400" />
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Số điện thoại</span>
                          <span className="font-semibold">{detailNode.data.phoneNumber || 'Không có SĐT'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-700">
                        <User size={16} className="text-gray-400" />
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Tên đăng nhập (Username)</span>
                          <span className="font-semibold font-mono">{detailNode.data.username}</span>
                        </div>
                      </div>

                      {detailNode.data.group && (
                        <div className="flex items-center gap-3 text-xs text-gray-700">
                          <Briefcase size={16} className="text-gray-400" />
                          <div>
                            <span className="text-gray-400 block text-[9px] uppercase font-semibold">Nhóm công việc</span>
                            <span className="font-semibold">{detailNode.data.group}</span>
                          </div>
                        </div>
                      )}

                      {detailNode.data.warehouseName && (
                        <div className="flex items-center gap-3 text-xs text-gray-700">
                          <Warehouse size={16} className="text-gray-400" />
                          <div>
                            <span className="text-gray-400 block text-[9px] uppercase font-semibold">Kho hàng POS</span>
                            <span className="font-bold text-blue-700">📦 {detailNode.data.warehouseName}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-700">
                        <MapPin size={16} className="text-gray-400" />
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Trạm trực thuộc</span>
                          {detailNode.data.techStationId ? (
                            <button
                              onClick={() => {
                                const matchedTech = currentTechStations.find(t => t.id === detailNode.data.techStationId);
                                if (matchedTech) {
                                  setSelectedTechId(matchedTech.id);
                                  setDetailNode({ type: 'tech', data: matchedTech });
                                }
                              }}
                              className="font-bold text-blue-600 hover:underline text-left"
                            >
                              {currentTechStations.find(t => t.id === detailNode.data.techStationId)?.name || 'Xem trạm'}
                            </button>
                          ) : (
                            <span className="font-semibold text-gray-400 italic">Không áp dụng trạm (Văn phòng)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-150 pt-4 flex flex-col gap-3">
                      <div className="flex justify-between items-center p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50 text-xs">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <FileSpreadsheet size={16} className="text-emerald-600" />
                          Báo cáo dịch vụ đã gửi:
                        </span>
                        <span className="font-black text-gray-800 text-sm">
                          {detailNode.data._count?.serviceReports || 0} báo cáo
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
