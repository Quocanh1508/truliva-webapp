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
  Warehouse,
  Network,
  BookOpen,
  Database,
  CheckCircle2,
  AlertCircle,
  Terminal,
  HeartPulse,
  Clock,
  Cpu,
  RefreshCw
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

// --- DATA FOR UNDERSTAND ANYTHING ANALYTICS ---
const UA_NODES = [
  { id: 'index.ts', label: 'src/index.ts', x: 260, y: 120, category: 'entry', size: 28, desc: 'Entry point của Express Server, khởi chạy máy chủ, các cron job và đăng ký các routes.' },
  { id: 'schema.prisma', label: 'prisma/schema.prisma', x: 120, y: 280, category: 'db', size: 26, desc: 'Định nghĩa 13 Models dữ liệu PostgreSQL kết nối qua Prisma ORM.' },
  { id: 'webhooks.ts', label: 'src/routes/webhooks.ts', x: 440, y: 80, category: 'route', size: 24, desc: 'Tiếp nhận các sự kiện Pancake Webhooks, thực hiện kiểm tra trùng lặp và chuyển dữ liệu.' },
  { id: 'orders.ts', label: 'src/routes/orders.ts', x: 440, y: 220, category: 'route', size: 24, desc: 'Cung cấp các API quản lý đơn hàng, phân công KTV, đồng bộ trạng thái ngược lên Pancake POS.' },
  { id: 'users.ts', label: 'src/routes/users.ts', x: 440, y: 340, category: 'route', size: 20, desc: 'API quản lý danh sách kỹ thuật viên, cấu hình trạm kỹ thuật, thông tin cá nhân và xuất Excel.' },
  { id: 'eventRouter.ts', label: 'src/services/eventRouter.ts', x: 620, y: 100, category: 'service', size: 22, desc: 'Điều phối sự kiện webhook, tự động phân loại đơn hàng (Order) hay khách hàng (Customer).' },
  { id: 'orderProcessor.ts', label: 'src/services/orderProcessor.ts', x: 800, y: 140, category: 'service', size: 24, desc: 'Xử lý logic nghiệp vụ đơn hàng, tạo/cập nhật thông tin khách và sản phẩm vào CSDL.' },
  { id: 'customerProcessor.ts', label: 'src/services/customerProcessor.ts', x: 800, y: 260, category: 'service', size: 20, desc: 'Xử lý đồng bộ thông tin khách hàng từ Pancake POS về hệ thống nội bộ.' },
  { id: 'notificationService.ts', label: 'src/services/notificationService.ts', x: 620, y: 400, category: 'service', size: 22, desc: 'Tự động gửi push notification qua Firebase FCM và Web Push khi KTV được phân công đơn mới.' },
  { id: 'logger.ts', label: 'src/utils/logger.ts', x: 120, y: 100, category: 'util', size: 18, desc: 'Hỗ trợ ghi nhận log của ứng dụng qua Winston logger.' },
  { id: 'emailService.ts', label: 'src/utils/emailService.ts', x: 260, y: 440, category: 'util', size: 18, desc: 'Gửi email khôi phục mật khẩu cho nhân sự.' }
];

const UA_EDGES = [
  { from: 'index.ts', to: 'webhooks.ts', desc: 'Đăng ký webhook routes' },
  { from: 'index.ts', to: 'orders.ts', desc: 'Đăng ký order routes' },
  { from: 'index.ts', to: 'users.ts', desc: 'Đăng ký user routes' },
  { from: 'webhooks.ts', to: 'eventRouter.ts', desc: 'Chuyển tiếp sự kiện webhook' },
  { from: 'orders.ts', to: 'orderProcessor.ts', desc: 'Xử lý logic đơn hàng' },
  { from: 'eventRouter.ts', to: 'orderProcessor.ts', desc: 'Gọi bộ xử lý đơn hàng' },
  { from: 'eventRouter.ts', to: 'customerProcessor.ts', desc: 'Gọi bộ xử lý khách hàng' },
  { from: 'orderProcessor.ts', to: 'schema.prisma', desc: 'Đọc/ghi Database qua Prisma' },
  { from: 'customerProcessor.ts', to: 'schema.prisma', desc: 'Đọc/ghi Database qua Prisma' },
  { from: 'orders.ts', to: 'notificationService.ts', desc: 'Kích hoạt gửi thông báo phân công' },
  { from: 'index.ts', to: 'logger.ts', desc: 'Sử dụng ghi log khởi động' },
  { from: 'users.ts', to: 'emailService.ts', desc: 'Sử dụng gửi mail mật khẩu' }
];

const UA_TOUR_STEPS = [
  {
    nodeId: 'index.ts',
    title: 'Bước 1: Khởi nguồn (Entry Point)',
    desc: 'Tất cả các kết nối, cron job và routes đều khởi nguồn tại src/index.ts. Đây là cổng đón đầu tiếp nhận mọi dữ liệu và webhook từ Pancake POS.'
  },
  {
    nodeId: 'schema.prisma',
    title: 'Bước 2: Cấu trúc CSDL (Database Schema)',
    desc: 'Toàn bộ mô hình dữ liệu (Order, Customer, User, ServiceReport, v.v.) được định hình trong prisma/schema.prisma, đảm bảo tính toàn vẹn và nhất quán của CSDL.'
  },
  {
    nodeId: 'webhooks.ts',
    title: 'Bước 3: Nhận tin (Webhook Router)',
    desc: 'API src/routes/webhooks.ts nhận các sự kiện Pancake Webhooks và thực hiện ghi raw event bất đồng bộ để tránh bị mất đơn hàng hoặc timeout.'
  },
  {
    nodeId: 'eventRouter.ts',
    title: 'Bước 4: Định tuyến Sự kiện (Event Router)',
    desc: 'src/services/eventRouter.ts sẽ phân loại các Webhooks để biết đây là sự kiện liên quan tới Khách hàng (Customer) hay Đơn hàng (Order) trước khi đưa vào xử lý sâu.'
  },
  {
    nodeId: 'orderProcessor.ts',
    title: 'Bước 5: Xử lý Đơn hàng (Order Processor)',
    desc: 'Trọng tâm nghiệp vụ nằm tại src/services/orderProcessor.ts. File này xử lý các quy tắc kinh doanh, đồng bộ trạng thái, khấu trừ tồn kho và cập nhật dữ liệu CSDL.'
  }
];

const UA_FILES_LIST = [
  { name: 'src/index.ts', lines: 209, complexity: 'Simple', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', connections: 4, desc: 'Điểm khởi đầu của ứng dụng Express Server.' },
  { name: 'src/routes/orders.ts', lines: 1718, complexity: 'Complex', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', connections: 28, desc: 'API nghiệp vụ quản lý và đồng bộ trạng thái đơn hàng.' },
  { name: 'src/routes/users.ts', lines: 442, complexity: 'Moderate', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', connections: 8, desc: 'Quản lý tài khoản, trạm kỹ thuật và nhân sự.' },
  { name: 'src/routes/webhooks.ts', lines: 183, complexity: 'Simple', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', connections: 5, desc: 'Endpoint tiếp nhận webhook Pancake POS.' },
  { name: 'src/services/orderProcessor.ts', lines: 307, complexity: 'Complex', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', connections: 16, desc: 'Core xử lý đồng bộ, khấu trừ kho và cập nhật DB.' },
  { name: 'src/services/eventRouter.ts', lines: 215, complexity: 'Moderate', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', connections: 11, desc: 'Bộ định tuyến phân loại sự kiện Pancake POS.' },
  { name: 'prisma/schema.prisma', lines: 330, complexity: 'Moderate', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', connections: 13, desc: 'Cơ sở dữ liệu Schema Prisma (13 models PostgreSQL).' }
];

export default function SystemMap() {
  const [activeTab, setActiveTab] = useState<'org' | 'health' | 'sop' | 'code'>('org');

  // Tab 1: Organization Map States
  const [stations, setStations] = useState<MainStation[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMainId, setSelectedMainId] = useState<string | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState<Record<string, any>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Tab 2: System Health Monitor States
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLogTab, setHealthLogTab] = useState<'webhooks' | 'audit'>('webhooks');

  // Tab 3: SOP & Onboarding States
  const [selectedSop, setSelectedSop] = useState<'leak' | 'install' | 'assign'>('leak');

  // Tab 4: Codebase Visualizer States
  const [codeTab, setCodeTab] = useState<'db' | 'files' | 'api' | 'ua'>('db');
  const [uaTab, setUaTab] = useState<'info' | 'files'>('info');
  const [hoveredUaNode, setHoveredUaNode] = useState<string | null>(null);
  const [uaSearchQuery, setUaSearchQuery] = useState<string>('');
  const [tourStep, setTourStep] = useState<number>(-1);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'backend': true,
    'backend_routes': true,
    'backend_services': false,
    'frontend': true,
    'frontend_pages': true,
    'github': false
  });
  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }));
  };
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  // Shared Detail Drawer state
  const [detailNode, setDetailNode] = useState<{
    type: 'main' | 'tech' | 'user' | 'service' | 'sopStep' | 'codeModel' | 'codeFile' | 'codeApi';
    data: any;
  } | null>(null);

  // Fetch Database Data for Org Map
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const stationsData = await getStations();
        const usersData = await fetchApi('/users');
        setStations(stationsData);
        setUsers(usersData.users || []);
        
        if (stationsData.length > 0) {
          setSelectedMainId(stationsData[0].id);
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

  // Fetch Live System Health Data
  const loadHealthData = async () => {
    try {
      setHealthLoading(true);
      setHealthError(null);
      const data = await fetchApi('/dev/system-health');
      setHealthData(data);
    } catch (err: any) {
      setHealthError(err.message || 'Lỗi khi kiểm tra sức khỏe hệ thống');
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'health') {
      loadHealthData();
    }
  }, [activeTab]);

  // Org Map Filtering Logic
  const filteredMainStations = useMemo(() => {
    if (!searchTerm.trim()) return stations;
    const term = searchTerm.toLowerCase();
    
    return stations.filter(main => {
      const matchName = main.name.toLowerCase().includes(term);
      const matchTechs = main.techStations.some(tech => tech.name.toLowerCase().includes(term));
      const matchUsers = users.some(u => {
        const isAssociated = u.techStationId 
          ? main.techStations.some(t => t.id === u.techStationId)
          : main.name.toLowerCase() === 'truliva';
        return isAssociated && u.fullName.toLowerCase().includes(term);
      });
      return matchName || matchTechs || matchUsers;
    });
  }, [stations, users, searchTerm]);

  const currentMain = useMemo(() => {
    return stations.find(m => m.id === selectedMainId) || null;
  }, [stations, selectedMainId]);

  const currentTechStations = useMemo(() => {
    if (!currentMain) return [];
    const baseTechs = [...currentMain.techStations];
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

  const currentPersonnel = useMemo(() => {
    if (!selectedTechId) return [];
    if (selectedTechId === 'virtual-office-station') {
      return users.filter(u => u.role !== 'KTV');
    }
    return users.filter(u => u.techStationId === selectedTechId);
  }, [selectedTechId, users]);

  // SVG Coordinates updates for Org Map
  const updateCoords = () => {
    if (activeTab !== 'org') return;
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

  useEffect(() => {
    if (loading || activeTab !== 'org') return;
    
    const timer = setTimeout(() => {
      updateCoords();
    }, 150);

    window.addEventListener('resize', updateCoords);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoords);
    };
  }, [loading, activeTab, selectedMainId, selectedTechId, currentTechStations, currentPersonnel, searchTerm]);

  // Org Click Handlers
  const handleMainClick = (mainId: string) => {
    setSelectedMainId(mainId);
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

  const handleTechClick = (techId: string) => {
    setSelectedTechId(techId);
    setSelectedUserId(null);
  };

  const handleUserClick = (user: UserProfile) => {
    setSelectedUserId(user.id);
    setDetailNode({
      type: 'user',
      data: user
    });
  };

  const handleMainDetail = (main: MainStation, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetailNode({
      type: 'main',
      data: main
    });
  };

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

  // SVG Connections generator for Org Map
  const svgConnections = useMemo(() => {
    if (activeTab !== 'org' || Object.keys(coords).length === 0) return null;
    const paths: React.ReactNode[] = [];

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
  }, [coords, activeTab, selectedMainId, selectedTechId, selectedUserId, currentTechStations, currentPersonnel]);

  // SOP static database definition
  const sopData = useMemo(() => {
    return {
      leak: {
        title: 'Quy trình xử lý ca rò rỉ nước (Khẩn cấp)',
        description: 'Các bước xử lý khẩn cấp khi khách hàng báo tin rò rỉ nước nhằm giảm thiểu hư hại tài sản và bảo đảm an toàn điện.',
        steps: [
          { id: 1, title: '1. Tiếp nhận sự vụ', role: 'Hotline', desc: 'Tiếp nhận cuộc gọi rò rỉ, ghi nhận tình hình ngập nước, model máy lọc.', icon: <Phone size={16} /> },
          { id: 2, title: '2. Cô lập từ xa', role: 'Hotline / Coordinator', desc: 'Hướng dẫn KH khóa van nước cấp và ngắt phích cắm điện của máy.', icon: <Activity size={16} /> },
          { id: 3, title: '3. Phân công gấp', role: 'Coordinator', desc: 'Chỉ định KTV gần nhất, gọi điện báo ca khẩn trong vòng 30 phút.', icon: <Users2 size={16} /> },
          { id: 4, title: '4. Khắc phục tại nhà', role: 'KTV', desc: 'Đến nơi, sửa nguồn rò rỉ (khớp nối, bình áp, cốc lọc), lau dọn nước.', icon: <MapPin size={16} /> },
          { id: 5, title: '5. Nghiệm thu & Báo cáo', role: 'KTV & Khách hàng', desc: 'Chụp ảnh trước/sau, lấy chữ ký nghiệm thu của KH, gửi báo cáo.', icon: <CheckCircle2 size={16} /> }
        ]
      },
      install: {
        title: 'Quy trình lắp đặt máy lọc nước mới',
        description: 'Quy trình tiếp nhận thiết bị, đến nhà khách hàng thi công lắp ráp và bàn giao máy lọc nước Truliva mới.',
        steps: [
          { id: 1, title: '1. Xác nhận đơn', role: 'Coordinator', desc: 'Kiểm tra đơn trên Pancake POS, liên hệ khách hàng chốt giờ lắp.', icon: <FileSpreadsheet size={16} /> },
          { id: 2, title: '2. Xuất kho thiết bị', role: 'KTV', desc: 'Nhận máy mới nguyên hộp và các linh kiện đi kèm tại kho của trạm.', icon: <Warehouse size={16} /> },
          { id: 3, title: '3. Lắp ráp kỹ thuật', role: 'KTV', desc: 'Định vị máy, khoan vòi inox, đấu van chia nước đầu vào và đường nước thải.', icon: <Building2 size={16} /> },
          { id: 4, title: '4. Sục rửa & Đo TDS', role: 'KTV', desc: 'Xả rửa lõi 15 phút, dùng bút đo TDS chất lượng nước đầu ra (TDS < 50).', icon: <Activity size={16} /> },
          { id: 5, title: '5. Dán tem & Bàn giao', role: 'KTV & Khách hàng', desc: 'Dán tem bảo hành, hướng dẫn KH sử dụng, ký tên biên bản bàn giao.', icon: <CheckCircle2 size={16} /> }
        ]
      },
      assign: {
        title: 'Quy trình tiếp nhận và phân công ca',
        description: 'Luồng nghiệp vụ xử lý từ khi có đơn hàng tự động đổ về cho đến khi được chỉ định KTV phụ trách.',
        steps: [
          { id: 1, title: '1. Đồng bộ đơn hàng', role: 'Truliva Server / Webhook', desc: 'Đơn từ Pancake tự động lưu vào DB Truliva với trạng thái Chờ xử lý.', icon: <Terminal size={16} /> },
          { id: 2, title: '2. Xác thực khu vực', role: 'Coordinator', desc: 'Điều phối viên kiểm tra địa chỉ, gán Trạm chính và Trạm kỹ thuật phụ trách.', icon: <Building2 size={16} /> },
          { id: 3, title: '3. Gán KTV & Hẹn giờ', role: 'Coordinator', desc: 'Chọn KTV ít ca nhất trong trạm, hẹn thời gian với KH và gửi thông báo.', icon: <Clock size={16} /> },
          { id: 4, title: '4. Giám sát tiến độ', role: 'Coordinator / Hotline', desc: 'Theo dõi tiến trình KTV đi ca, đôn đốc nếu trễ lịch hẹn.', icon: <Activity size={16} /> }
        ]
      }
    };
  }, []);

  const currentSop = useMemo(() => {
    return sopData[selectedSop];
  }, [selectedSop, sopData]);

  // Codebase Visualizer database definitions
  const erdModels = useMemo(() => {
    return [
      {
        id: 'MainStation',
        name: 'MainStation (Trạm chính)',
        x: 50, y: 30,
        desc: 'Lưu trữ thông tin các Trạm chính (như Truliva, Kitchen Store...) đóng vai trò quản lý cấp vùng địa lý.',
        prismaCode: `model MainStation {\n  id        String        @id @default(uuid())\n  name      String        @unique\n  isActive  Boolean       @default(true) @map("is_active")\n  createdAt DateTime      @default(now()) @map("created_at")\n  techStations TechStation[]\n  orders    Order[]\n  @@map("main_stations")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'name', type: 'String', desc: 'Tên trạm chính (duy nhất)' },
          { name: 'isActive', type: 'Boolean', desc: 'Trạng thái hoạt động' },
          { name: 'createdAt', type: 'DateTime', desc: 'Thời gian tạo' }
        ]
      },
      {
        id: 'TechStation',
        name: 'TechStation (Trạm kỹ thuật)',
        x: 50, y: 280,
        desc: 'Trạm kỹ thuật trực thuộc Trạm chính. Là nơi quy tụ KTV và vật tư kho bãi cho từng cụm khu vực nhỏ.',
        prismaCode: `model TechStation {\n  id            String      @id @default(uuid())\n  name          String\n  mainStationId String      @map("main_station_id")\n  isActive      Boolean     @default(true) @map("is_active")\n  mainStation   MainStation @relation(fields: [mainStationId], references: [id])\n  users         User[]\n  orders        Order[]\n  @@map("tech_stations")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'name', type: 'String', desc: 'Tên trạm kỹ thuật' },
          { name: 'mainStationId', type: 'String (FK)', desc: 'Khóa ngoại liên kết MainStation' },
          { name: 'isActive', type: 'Boolean', desc: 'Trạng thái hoạt động' }
        ]
      },
      {
        id: 'User',
        name: 'User (Tài khoản nhân sự)',
        x: 285, y: 170,
        desc: 'Bảng người dùng lưu trữ tất cả các tài khoản hệ thống với các vai trò khác nhau (ADMIN, COORDINATOR, KTV, STAFF...).',
        prismaCode: `model User {\n  id                 String          @id @default(uuid())\n  username           String          @unique\n  password           String\n  fullName           String          @map("full_name")\n  phoneNumber        String?         @map("phone_number")\n  role               Role            @default(KTV)\n  group              String?         // Ví dụ: Service, eCom\n  techStationId      String?         @map("tech_station_id")\n  pushToken          String?         @map("push_token")\n  isActive           Boolean         @default(true) @map("is_active")\n  techStation        TechStation?    @relation(fields: [techStationId], references: [id])\n  assignedOrders     Order[]         @relation("assignedKtv")\n  serviceReports     ServiceReport[]\n  @@map("users")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'username', type: 'String', desc: 'Tên đăng nhập (duy nhất)' },
          { name: 'fullName', type: 'String', desc: 'Họ và tên nhân sự' },
          { name: 'role', type: 'Enum (KTV|ADMIN...)', desc: 'Vai trò phân quyền hệ thống' },
          { name: 'group', type: 'String', desc: 'Nhóm nghiệp vụ (ví dụ: Service)' },
          { name: 'techStationId', type: 'String (FK)', desc: 'Trạm kỹ thuật trực thuộc' },
          { name: 'isActive', type: 'Boolean', desc: 'Tài khoản có hoạt động không' }
        ]
      },
      {
        id: 'Order',
        name: 'Order (Đơn hàng/Dịch vụ)',
        x: 520, y: 170,
        desc: 'Trọng tâm nghiệp vụ của hệ thống. Lưu thông tin đơn hàng đồng bộ từ Pancake POS và trạng thái xử lý nội bộ Truliva.',
        prismaCode: `model Order {\n  id              String         @id @default(uuid())\n  pancakeOrderId  String         @unique @map("pancake_order_id")\n  customerName    String         @map("customer_name")\n  customerPhone   String         @map("customer_phone")\n  address         String\n  adminStatus     String?        @map("admin_status") // chờ xử lý, đang thực hiện, hoàn thành, hủy đơn...\n  assignedKtvId   String?        @map("assigned_ktv_id")\n  mainStationId   String?        @map("main_station_id")\n  techStationId   String?        @map("tech_station_id")\n  assignedKtv     User?          @relation("assignedKtv", fields: [assignedKtvId], references: [id])\n  mainStation     MainStation?   @relation(fields: [mainStationId], references: [id])\n  techStation     TechStation?   @relation(fields: [techStationId], references: [id])\n  items           OrderItem[]\n  serviceReports  ServiceReport[]\n  @@map("orders")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'pancakeOrderId', type: 'String', desc: 'Mã đơn hàng đồng bộ từ Pancake POS' },
          { name: 'customerName', type: 'String', desc: 'Họ và tên khách hàng' },
          { name: 'customerPhone', type: 'String', desc: 'Số điện thoại khách hàng' },
          { name: 'adminStatus', type: 'String', desc: 'Trạng thái xử lý nội bộ tại Truliva' },
          { name: 'assignedKtvId', type: 'String (FK)', desc: 'Kỹ thuật viên được chỉ định nhận ca' },
          { name: 'mainStationId', type: 'String (FK)', desc: 'Trạm chính chịu trách nhiệm' },
          { name: 'techStationId', type: 'String (FK)', desc: 'Trạm kỹ thuật chịu trách nhiệm' }
        ]
      },
      {
        id: 'ServiceReport',
        name: 'ServiceReport (Báo cáo KTV)',
        x: 775, y: 30,
        desc: 'Báo cáo do KTV nộp sau khi hoàn tất sửa chữa/lắp đặt tại nhà khách hàng, chứa hình ảnh kết quả và chữ ký khách hàng.',
        prismaCode: `model ServiceReport {\n  id             String       @id @default(uuid())\n  orderId        String       @map("order_id")\n  ktvId          String       @map("ktv_id")\n  status         String       @default("pending") // pending, approved, rejected\n  imageUrls      String[]     @map("image_urls")\n  customerSignature String?   @map("customer_signature")\n  order          Order        @relation(fields: [orderId], references: [id])\n  ktv            User         @relation(fields: [ktvId], references: [id])\n  @@map("service_reports")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'orderId', type: 'String (FK)', desc: 'Đơn hàng/Ca dịch vụ tương ứng' },
          { name: 'ktvId', type: 'String (FK)', desc: 'Kỹ thuật viên nộp báo cáo' },
          { name: 'status', type: 'String', desc: 'Trạng thái kiểm duyệt (pending|approved|rejected)' },
          { name: 'imageUrls', type: 'String[]', desc: 'Ảnh chụp hiện trạng lắp đặt/sửa chữa' }
        ]
      },
      {
        id: 'OrderItem',
        name: 'OrderItem (Chi tiết thiết bị)',
        x: 775, y: 250,
        desc: 'Bảng liên kết trung gian biểu thị các máy lọc nước hoặc lõi lọc đi kèm trong một Đơn hàng.',
        prismaCode: `model OrderItem {\n  id          String   @id @default(uuid())\n  orderId     String   @map("order_id")\n  productId   String   @map("product_id")\n  quantity    Int      @default(1)\n  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)\n  product     Product  @relation(fields: [productId], references: [id])\n  @@map("order_items")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'orderId', type: 'String (FK)', desc: 'Mã đơn hàng liên kết' },
          { name: 'productId', type: 'String (FK)', desc: 'Mã sản phẩm thiết bị liên kết' },
          { name: 'quantity', type: 'Int', desc: 'Số lượng thiết bị' }
        ]
      },
      {
        id: 'Product',
        name: 'Product (Sản phẩm hàng hóa)',
        x: 775, y: 440,
        desc: 'Danh mục thiết bị máy lọc nước, linh kiện thay thế, lõi lọc được định nghĩa sẵn trong hệ thống.',
        prismaCode: `model Product {\n  id          String      @id @default(uuid())\n  name        String\n  code        String      @unique\n  price       Float\n  items       OrderItem[]\n  @@map("products")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'name', type: 'String', desc: 'Tên sản phẩm hàng hóa' },
          { name: 'code', type: 'String', desc: 'Mã sản phẩm (duy nhất)' },
          { name: 'price', type: 'Float', desc: 'Đơn giá niêm yết' }
        ]
      },
      {
        id: 'AuditLog',
        name: 'AuditLog (Lịch sử thay đổi)',
        x: 520, y: 450,
        desc: 'Lưu vết lịch sử thao tác quan trọng trên đơn hàng (Ai đã tạo đơn, đã gán KTV nào, thay đổi trạng thái lúc nào) phục vụ đối soát.',
        prismaCode: `model AuditLog {\n  id          String   @id @default(uuid())\n  entityType  String   @map("entity_type") // ví dụ: "Order"\n  entityId    String   @map("entity_id")\n  action      String   // created, updated, assigned, cancelled...\n  changes     Json?\n  userId      String   @map("user_id")\n  userName    String   @map("user_name")\n  createdAt   DateTime @default(now()) @map("created_at")\n  @@map("audit_logs")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'entityType', type: 'String', desc: 'Loại thực thể bị thay đổi (Order)' },
          { name: 'entityId', type: 'String', desc: 'ID của thực thể tương ứng' },
          { name: 'action', type: 'String', desc: 'Hành động thay đổi (updated, assigned...)' },
          { name: 'userName', type: 'String', desc: 'Tên người dùng thực hiện thao tác' }
        ]
      },
      {
        id: 'Feedback',
        name: 'Feedback (Góp ý kỹ thuật)',
        x: 285, y: 450,
        desc: 'Các phản hồi đóng góp ý kiến của KTV hoặc nhân sự về ứng dụng được lưu trực tiếp vào CSDL để DEV xử lý.',
        prismaCode: `model Feedback {\n  id        String   @id @default(uuid())\n  userId    String   @map("user_id")\n  content   String\n  imageUrls String[] @map("image_urls")\n  createdAt DateTime @default(now()) @map("created_at")\n  user      User     @relation(fields: [userId], references: [id])\n  @@map("feedbacks")\n}`,
        fields: [
          { name: 'id', type: 'String (UUID)', key: true, desc: 'Khóa chính' },
          { name: 'userId', type: 'String (FK)', desc: 'Người gửi phản hồi' },
          { name: 'content', type: 'String', desc: 'Nội dung phản hồi' },
          { name: 'createdAt', type: 'DateTime', desc: 'Ngày tạo phản hồi' }
        ]
      }
    ];
  }, []);

  const filesTree = useMemo(() => {
    return {
      name: 'Truliva Root (Thư mục gốc)',
      type: 'folder',
      key: 'root',
      children: [
        {
          name: '.github/workflows',
          type: 'folder',
          key: 'github',
          children: [
            { name: 'deploy.yml', type: 'file', key: 'deploy_yml', desc: 'Cấu hình quy trình CI/CD tự động deploy lên VPS. Đã được nâng cấp để chạy ép buộc trên môi trường Node.js 24 để tắt cảnh báo Node 20 hết hạn.' }
          ]
        },
        {
          name: 'src (Express Backend)',
          type: 'folder',
          key: 'backend',
          children: [
            {
              name: 'config',
              type: 'folder',
              key: 'backend_config',
              children: [
                { name: 'database.ts', type: 'file', key: 'db_ts', desc: 'Thiết lập kết nối PostgreSQL và khởi tạo đối tượng prisma dùng chung toàn server.' }
              ]
            },
            {
              name: 'middleware',
              type: 'folder',
              key: 'backend_middleware',
              children: [
                { name: 'authSession.ts', type: 'file', key: 'auth_ts', desc: 'Bộ lọc xác thực phiên đăng nhập (JWT). Khai báo các middleware phân quyền requireAuth, requireAdmin, requireDev, requireCoordinatorOrAdmin.' }
              ]
            },
            {
              name: 'routes',
              type: 'folder',
              key: 'backend_routes',
              children: [
                { name: 'orders.ts', type: 'file', key: 'routes_orders', desc: 'Chứa các API nghiệp vụ đơn hàng. Xử lý logic gán KTV, cập nhật trạng thái đơn hàng, và đồng bộ thủ công từ Pancake POS.' },
                { name: 'reports.ts', type: 'file', key: 'routes_reports', desc: 'Xử lý các API nộp báo cáo ca hoàn thành từ KTV, phê duyệt và hủy duyệt báo cáo.' },
                { name: 'users.ts', type: 'file', key: 'routes_users', desc: 'Quản lý tài khoản nhân viên văn phòng, trạm và kỹ thuật viên.' },
                { name: 'dev.ts', type: 'file', key: 'routes_dev', desc: 'API dành riêng cho DEV thực hiện ping live kiểm tra Database, Pancake POS, Firebase Admin.' }
              ]
            },
            {
              name: 'services',
              type: 'folder',
              key: 'backend_services',
              children: [
                { name: 'orderProcessor.ts', type: 'file', key: 'srv_processor', desc: 'Xử lý chuyển trạng thái đơn hàng và ghi chép nhật ký thay đổi (Audit Log).' },
                { name: 'notificationService.ts', type: 'file', key: 'srv_notification', desc: 'Dịch vụ kết nối SDK Firebase Admin để gửi tin nhắn Push Notification đến điện thoại KTV.' },
                { name: 'orderSyncScheduler.ts', type: 'file', key: 'srv_sync', desc: 'Chạy nền tự động hẹn giờ (cron job) để kéo đơn hàng mới từ Pancake POS API.' }
              ]
            },
            { name: 'index.ts', type: 'file', key: 'index_ts', desc: 'Điểm khởi tạo (Entrypoint) của Express App. Đăng ký các router, cấu hình bảo mật helmet/cors, giới hạn rate limit và mở cổng lắng nghe 3000.' }
          ]
        },
        {
          name: 'webapp/src (Vite Frontend)',
          type: 'folder',
          key: 'frontend',
          children: [
            {
              name: 'api',
              type: 'folder',
              key: 'frontend_api',
              children: [
                { name: 'client.ts', type: 'file', key: 'client_ts', desc: 'Cấu hình fetch client đính kèm Bearer token từ localStorage để gọi API lên server.' }
              ]
            },
            {
              name: 'pages',
              type: 'folder',
              key: 'frontend_pages',
              children: [
                {
                  name: 'admin',
                  type: 'folder',
                  key: 'pages_admin',
                  children: [
                    { name: 'OrderList.tsx', type: 'file', key: 'pages_orders', desc: 'Quản lý danh sách ca dịch vụ dành cho Admin và Điều phối viên. Hỗ trợ lọc nâng cao, gán ca cho KTV, xuất Excel.' },
                    { name: 'Dashboard.tsx', type: 'file', desc: 'Báo cáo thống kê hiệu suất, đơn hàng, lượng báo cáo, biểu đồ doanh thu.' }
                  ]
                },
                {
                  name: 'dev',
                  type: 'folder',
                  key: 'pages_dev',
                  children: [
                    { name: 'SystemMap.tsx', type: 'file', key: 'pages_systemmap', desc: 'Trang đồ thị mạng lưới điều hành trạm, giám sát sức khỏe live, quy trình SOP và cấu trúc mã nguồn dự án.' }
                  ]
                },
                {
                  name: 'ktv',
                  type: 'folder',
                  key: 'pages_ktv',
                  children: [
                    { name: 'MyOrders.tsx', type: 'file', key: 'pages_ktvorders', desc: 'Giao diện ứng dụng di động cho KTV nhận ca, xem bản đồ và nộp báo cáo kết quả.' }
                  ]
                }
              ]
            },
            { name: 'App.tsx', type: 'file', key: 'app_tsx', desc: 'Router cấu hình các định tuyến cho webapp, bọc các route trong ProtectedRoute để kiểm tra vai trò (Role).' }
          ]
        },
        { name: 'prisma/schema.prisma', type: 'file', key: 'schema_prisma', desc: 'Định nghĩa cơ sở dữ liệu quan hệ (ERD Schema), các bảng và mối liên kết.' }
      ]
    };
  }, []);

  const apiRouters = useMemo(() => {
    return [
      {
        name: 'Auth Router (/api/auth)',
        endpoints: [
          { method: 'POST', path: '/login', desc: 'Đăng nhập người dùng bằng tài khoản/mật khẩu, trả về JWT Token và thông tin tài khoản.', roles: 'Bất kỳ ai (Chưa đăng nhập)' },
          { method: 'POST', path: '/logout', desc: 'Đăng xuất tài khoản, xóa cookie session_token trên trình duyệt.', roles: 'Tài khoản đã đăng nhập' },
          { method: 'GET', path: '/me', desc: 'Lấy thông tin chi tiết và quyền của tài khoản hiện tại dựa trên JWT Token.', roles: 'Tài khoản đã đăng nhập' }
        ]
      },
      {
        name: 'Orders Router (/api/orders)',
        endpoints: [
          { method: 'GET', path: '/', desc: 'Lấy danh sách đơn hàng/ca dịch vụ kèm theo bộ lọc (Trạm, KTV, Thời gian, Trạng thái). Tự động lọc IAM (KTV chỉ thấy đơn của mình, Saler chỉ thấy đơn tự tạo).', roles: 'ADMIN, COORDINATOR, SALE_SUPERVISOR, SALER, HOTLINE, STAFF, KTV' },
          { method: 'POST', path: '/', desc: 'Tạo ca dịch vụ thủ công (Chỉ cho phép các vai trò văn phòng có quyền điều phối). Chặn vai trò KTV và STAFF nhóm Service.', roles: 'ADMIN, DEV, COORDINATOR, SALE_SUPERVISOR, SALER, HOTLINE, STAFF (khác Service)' },
          { method: 'PATCH', path: '/:id', desc: 'Cập nhật thông tin đơn hàng, chỉ định KTV (Phân công ca) và thời gian hẹn khách.', roles: 'ADMIN, DEV, COORDINATOR, SALE_SUPERVISOR, SALER, HOTLINE, STAFF (khác Service)' },
          { method: 'POST', path: '/sync', desc: 'Đồng bộ thủ công 50 đơn hàng mới nhất từ Pancake POS API về hệ thống.', roles: 'ADMIN, DEV, COORDINATOR, SALE_SUPERVISOR, SALER, HOTLINE, STAFF (khác Service)' },
          { method: 'GET', path: '/export', desc: 'Kết xuất và tải xuống danh sách đơn hàng đã lọc ra file Excel.', roles: 'ADMIN, DEV, COORDINATOR, STAFF (Service)' }
        ]
      },
      {
        name: 'Reports Router (/api/reports)',
        endpoints: [
          { method: 'GET', path: '/', desc: 'Lấy danh sách các báo cáo hoàn thành ca của KTV để chờ phê duyệt.', roles: 'ADMIN, COORDINATOR, KTV (chỉ xem báo cáo của mình)' },
          { method: 'POST', path: '/', desc: 'KTV nộp báo cáo hoàn thành ca lên hệ thống, kèm danh sách ảnh hiện trường và chữ ký KH.', roles: 'KTV' },
          { method: 'PATCH', path: '/:id', desc: 'Admin/Điều phối duyệt hoặc từ chối báo cáo KTV. Nếu phê duyệt, hệ thống tự động đổi trạng thái đơn hàng tương ứng sang "Hoàn thành".', roles: 'ADMIN, COORDINATOR' }
        ]
      },
      {
        name: 'Dev Router (/api/dev)',
        endpoints: [
          { method: 'GET', path: '/system-health', desc: 'Thực hiện kiểm tra kết nối (Live ping) tới Database, API Pancake và Firebase, trả về log hệ thống mới nhất.', roles: 'DEV' }
        ]
      },
      {
        name: 'Users Router (/api/users)',
        endpoints: [
          { method: 'GET', path: '/', desc: 'Lấy danh sách người dùng trong hệ thống kèm số ca chưa hoàn thành của từng KTV.', roles: 'ADMIN, COORDINATOR' },
          { method: 'POST', path: '/', desc: 'Tạo mới tài khoản nhân viên hoặc KTV.', roles: 'ADMIN, COORDINATOR' },
          { method: 'PATCH', path: '/:id', desc: 'Cập nhật thông tin tài khoản, khóa hoặc mở khóa tài khoản nhân viên.', roles: 'ADMIN, COORDINATOR' }
        ]
      }
    ];
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Self-contained premium animations */}
      <style>{`
        @keyframes flow {
          to {
            stroke-dashoffset: -20;
          }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        @keyframes pulse-red-ring {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .flow-line {
          animation: flow 1.2s linear infinite;
        }
        .flow-line-green {
          animation: flow 0.8s linear infinite;
        }
        .flow-line-red {
          animation: flow 1.5s linear infinite;
          stroke: #ef4444;
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
        .node-pulse-blue {
          box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
          animation: pulse-ring 2s infinite ease-in-out;
        }
        .node-pulse-red {
          animation: pulse-red-ring 2s infinite;
        }
        /* Custom scrollbar for dark ERD */
        .erd-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .erd-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .erd-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
        .erd-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border-b border-gray-200 gap-4">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B] flex items-center gap-2">
            <Network size={24} className="text-blue-600" />
            Bản đồ Mạng lưới & Vận hành Hệ thống Truliva
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {activeTab === 'org' && 'Sơ đồ liên kết trực quan giữa Trạm chính ➔ Trạm kỹ thuật ➔ Lực lượng kỹ thuật viên & Nhân sự'}
            {activeTab === 'health' && 'Bảng điều khiển giám sát trực tiếp (Live check) kết nối Cơ sở dữ liệu và các API đối tác'}
            {activeTab === 'sop' && 'Sơ đồ luồng hướng dẫn vận hành chuẩn (SOP) và tài liệu đào tạo nhân sự mới'}
            {activeTab === 'code' && 'Trực quan hóa cấu trúc dự án từ cấp phân tử: sơ đồ CSDL, cấu trúc file và bản đồ API Router'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner shrink-0">
          <button
            onClick={() => { setActiveTab('org'); setDetailNode(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'org' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Users2 size={14} />
            <span>Sơ đồ nhân sự</span>
          </button>
          <button
            onClick={() => { setActiveTab('health'); setDetailNode(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'health' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <HeartPulse size={14} className={activeTab === 'health' ? 'text-red-500 animate-pulse' : ''} />
            <span>Sức khỏe hệ thống</span>
          </button>
          <button
            onClick={() => { setActiveTab('sop'); setDetailNode(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'sop' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <BookOpen size={14} />
            <span>Quy trình (SOP)</span>
          </button>
          <button
            onClick={() => { setActiveTab('code'); setDetailNode(null); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'code' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Cpu size={14} />
            <span>Mã nguồn (Code)</span>
          </button>
        </div>

        {/* Search Input (Only for Org Map) */}
        {activeTab === 'org' && (
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
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <span className="spinner border-t-blue-600 w-10 h-10"></span>
        </div>
      ) : (
        <div className="flex-1 flex relative overflow-hidden">
          
          {/* TAB 1: Organization Map Viewport */}
          {activeTab === 'org' && (
            <div 
              ref={containerRef}
              className="flex-1 overflow-auto p-8 relative flex justify-between gap-12 select-none"
              style={{ minWidth: '960px' }}
            >
              {svgConnections}

              {/* Column 1: Main Stations */}
              <div className="w-64 flex flex-col gap-4 relative z-10">
                <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Building2 size={14} /> Trạm chính ({filteredMainStations.length})
                </div>
                <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredMainStations.map(main => {
                    const isSelected = selectedMainId === main.id;
                    const isMatched = searchTerm && main.name.toLowerCase().includes(searchTerm.toLowerCase());
                    
                    return (
                      <div
                        key={main.id}
                        id={`node-main-${main.id}`}
                        onClick={() => handleMainClick(main.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex justify-between items-center ${
                          isSelected 
                            ? 'node-active-blue border-blue-500 font-bold text-blue-900 bg-blue-50/70 shadow-sm' 
                            : isMatched
                              ? 'border-yellow-400 bg-yellow-50/50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <Building2 size={16} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-gray-800 truncate">{main.name}</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">{main.techStations.length} trạm con</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleMainDetail(main, e)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-slate-100 transition-colors shrink-0"
                          title="Xem chi tiết trạm chính"
                        >
                          <Activity size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {filteredMainStations.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs italic bg-white border border-gray-150 rounded-xl">
                      Không tìm thấy trạm nào
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
                    const isMatched = searchTerm && tech.name.toLowerCase().includes(searchTerm.toLowerCase());
                    const isVirtual = tech.id === 'virtual-office-station';
                    
                    return (
                      <div
                        key={tech.id}
                        id={`node-tech-${tech.id}`}
                        onClick={() => handleTechClick(tech.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex justify-between items-center ${
                          isSelected 
                            ? 'node-active-blue border-blue-500 font-bold text-blue-900 bg-blue-50/70 shadow-sm' 
                            : isMatched
                              ? 'border-yellow-400 bg-yellow-50/50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <MapPin size={16} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-gray-800 truncate">{tech.name}</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {isVirtual 
                                ? `${users.filter(u => u.role !== 'KTV').length} thành viên`
                                : `${users.filter(u => u.techStationId === tech.id).length} KTV`
                              }
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleTechDetail(tech, e)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-slate-100 transition-colors shrink-0"
                          title="Xem chi tiết trạm kỹ thuật"
                        >
                          <Activity size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {currentTechStations.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs italic bg-white border border-gray-150 rounded-xl">
                      Chọn Trạm chính để xem danh sách trạm con
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Personnel */}
              <div className="w-72 flex flex-col gap-4 relative z-10">
                <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Users2 size={14} /> Nhân sự trực thuộc ({currentPersonnel.length})
                </div>
                <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
                  {currentPersonnel.map(user => {
                    const isSelected = selectedUserId === user.id;
                    const isMatched = searchTerm && user.fullName.toLowerCase().includes(searchTerm.toLowerCase());
                    
                    return (
                      <div
                        key={user.id}
                        id={`node-user-${user.id}`}
                        onClick={() => handleUserClick(user)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex justify-between items-center ${
                          isSelected 
                            ? 'node-active-emerald border-emerald-500 font-bold text-emerald-900 bg-emerald-50/70 shadow-sm' 
                            : isMatched
                              ? 'border-yellow-400 bg-yellow-50/50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
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
                      Chọn Trạm kỹ thuật để hiển thị danh sách nhân sự
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: System Health Monitor Viewport */}
          {activeTab === 'health' && (
            <div className="flex-1 overflow-auto p-6 flex flex-col gap-6" style={{ minWidth: '960px' }}>
              
              {/* Graphic Topology Block */}
              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm relative flex flex-col h-[380px] overflow-hidden">
                <div className="flex justify-between items-center z-10">
                  <div className="flex items-center gap-2">
                    <Activity size={18} className="text-blue-600" />
                    <span className="font-bold text-sm text-gray-800">Sơ đồ liên kết live kết nối hệ thống</span>
                  </div>
                  <button 
                    onClick={loadHealthData} 
                    disabled={healthLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-slate-50 text-xs font-semibold text-gray-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={healthLoading ? 'animate-spin' : ''} />
                    Làm mới kết nối
                  </button>
                </div>

                {healthLoading && !healthData ? (
                  <div className="flex-1 flex justify-center items-center">
                    <span className="spinner border-t-blue-600 w-8 h-8"></span>
                  </div>
                ) : healthError ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-red-500 gap-2">
                    <AlertCircle size={32} />
                    <span className="text-xs font-semibold">{healthError}</span>
                  </div>
                ) : healthData ? (
                  <div className="flex-1 relative mt-4">
                    {/* SVG lines layer */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                      {/* Server to DB line */}
                      <path 
                        d="M 400 170 L 190 170" 
                        stroke={healthData.health.database.status === 'healthy' ? '#10b981' : healthData.health.database.status === 'warning' ? '#f59e0b' : '#ef4444'} 
                        strokeWidth="2.5" 
                        fill="none" 
                      />
                      {healthData.health.database.status === 'healthy' && (
                        <path 
                          d="M 400 170 L 190 170" 
                          stroke="#10b981" 
                          strokeWidth="3.5" 
                          fill="none" 
                          className="flow-line"
                          strokeDasharray="6 4"
                        />
                      )}

                      {/* Server to Pancake line */}
                      <path 
                        d="M 400 150 C 400 100, 520 80, 600 80" 
                        stroke={healthData.health.pancake.status === 'healthy' ? '#10b981' : healthData.health.pancake.status === 'warning' ? '#f59e0b' : '#ef4444'} 
                        strokeWidth="2.5" 
                        fill="none" 
                      />
                      {healthData.health.pancake.status === 'healthy' && (
                        <path 
                          d="M 400 150 C 400 100, 520 80, 600 80" 
                          stroke="#10b981" 
                          strokeWidth="3.5" 
                          fill="none" 
                          className="flow-line"
                          strokeDasharray="6 4"
                        />
                      )}

                      {/* Server to Firebase line */}
                      <path 
                        d="M 400 190 C 400 240, 520 260, 600 260" 
                        stroke={healthData.health.firebase.status === 'healthy' ? '#10b981' : healthData.health.firebase.status === 'warning' ? '#f59e0b' : '#ef4444'} 
                        strokeWidth="2.5" 
                        fill="none" 
                      />
                      {healthData.health.firebase.status === 'healthy' && (
                        <path 
                          d="M 400 190 C 400 240, 520 260, 600 260" 
                          stroke="#10b981" 
                          strokeWidth="3.5" 
                          fill="none" 
                          className="flow-line"
                          strokeDasharray="6 4"
                        />
                      )}
                    </svg>

                    {/* Nodes Absolute Layout */}
                    
                    {/* Database Node (Left) */}
                    <div 
                      onClick={() => setDetailNode({ type: 'service', data: { name: 'Prisma Database (PostgreSQL)', key: 'database', ...healthData.health.database } })}
                      className={`absolute left-[50px] top-[120px] w-[140px] h-[100px] rounded-2xl border-2 bg-white flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all p-3 text-center ${
                        healthData.health.database.status === 'healthy' ? 'border-green-500 shadow-emerald-55 bg-green-50/20' : healthData.health.database.status === 'warning' ? 'border-amber-500 bg-amber-50/10' : 'border-red-500 node-pulse-red'
                      }`}
                    >
                      <Database className={healthData.health.database.status === 'healthy' ? 'text-green-600' : healthData.health.database.status === 'warning' ? 'text-amber-500' : 'text-red-600'} size={24} />
                      <h4 className="font-bold text-xs text-gray-800 mt-2">Cơ sở dữ liệu</h4>
                      <span className="text-[10px] text-gray-500 mt-1">
                        {healthData.health.database.status === 'healthy' ? `${healthData.health.database.pingMs}ms` : 'Lỗi kết nối'}
                      </span>
                    </div>

                    {/* Server Node (Center) */}
                    <div 
                      onClick={() => setDetailNode({ type: 'service', data: { name: 'Truliva App Backend Server', key: 'server', ...healthData.health.server } })}
                      className="absolute left-[330px] top-[110px] w-[140px] h-[120px] rounded-2xl border-2 border-blue-500 bg-white flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all p-3 text-center shadow-lg"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 node-pulse-blue relative">
                        <Cpu size={24} />
                      </div>
                      <h4 className="font-bold text-xs text-gray-800 mt-2">Truliva Backend</h4>
                      <span className="text-[10px] text-gray-500 mt-0.5">Uptime: {healthData.health.server.uptime}s</span>
                    </div>

                    {/* Pancake Node (Right Top) */}
                    <div 
                      onClick={() => setDetailNode({ type: 'service', data: { name: 'Pancake POS API', key: 'pancake', ...healthData.health.pancake } })}
                      className={`absolute left-[600px] top-[30px] w-[150px] h-[100px] rounded-2xl border-2 bg-white flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all p-3 text-center ${
                        healthData.health.pancake.status === 'healthy' ? 'border-green-500 shadow-emerald-55 bg-green-50/20' : healthData.health.pancake.status === 'warning' ? 'border-amber-500 bg-amber-50/10' : 'border-red-500 node-pulse-red'
                      }`}
                    >
                      <RefreshCw className={healthData.health.pancake.status === 'healthy' ? 'text-green-600' : healthData.health.pancake.status === 'warning' ? 'text-amber-500' : 'text-red-600'} size={24} />
                      <h4 className="font-bold text-xs text-gray-800 mt-2">Pancake POS API</h4>
                      <span className="text-[10px] text-gray-500 mt-1">
                        {healthData.health.pancake.status === 'healthy' ? `Ping: ${healthData.health.pancake.pingMs}ms` : 'Mất kết nối'}
                      </span>
                    </div>

                    {/* Firebase FCM Node (Right Bottom) */}
                    <div 
                      onClick={() => setDetailNode({ type: 'service', data: { name: 'Firebase Cloud Messaging', key: 'firebase', ...healthData.health.firebase } })}
                      className={`absolute left-[600px] top-[210px] w-[150px] h-[100px] rounded-2xl border-2 bg-white flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all p-3 text-center ${
                        healthData.health.firebase.status === 'healthy' ? 'border-green-500 shadow-emerald-55 bg-green-50/20' : healthData.health.firebase.status === 'warning' ? 'border-amber-500 bg-amber-50/10' : 'border-red-500 node-pulse-red'
                      }`}
                    >
                      <Activity className={healthData.health.firebase.status === 'healthy' ? 'text-green-600' : healthData.health.firebase.status === 'warning' ? 'text-amber-500' : 'text-red-600'} size={24} />
                      <h4 className="font-bold text-xs text-gray-800 mt-2">Firebase FCM</h4>
                      <span className="text-[10px] text-gray-500 mt-1">
                        {healthData.health.firebase.status === 'healthy' ? 'Sẵn sàng' : 'Không khả dụng'}
                      </span>
                    </div>

                  </div>
                ) : null}
              </div>

              {/* Data Logs Tables Block */}
              {healthData && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden min-h-[300px]">
                  {/* Internal tabs for Logs */}
                  <div className="flex border-b border-gray-200 bg-slate-50 p-2 justify-between items-center">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHealthLogTab('webhooks')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          healthLogTab === 'webhooks' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <Terminal size={14} />
                        Nhật ký Webhook Pancake (Mới nhất)
                      </button>
                      <button
                        onClick={() => setHealthLogTab('audit')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          healthLogTab === 'audit' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <Clock size={14} />
                        Lịch sử thay đổi hệ thống (Audit Log)
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {healthLogTab === 'webhooks' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-gray-400 font-bold border-b border-gray-150 uppercase tracking-wider text-[10px]">
                            <th className="p-3.5 pl-6">Mã Event</th>
                            <th className="p-3.5">Loại Sự kiện</th>
                            <th className="p-3.5">Thời gian nhận</th>
                            <th className="p-3.5 text-center">Trạng thái</th>
                            <th className="p-3.5 text-center">Xử lý (Ms)</th>
                            <th className="p-3.5">Log lỗi / Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {healthData.webhooks.map((w: any) => (
                            <tr key={w.id} className="border-b border-gray-100 hover:bg-slate-50/50">
                              <td className="p-3 pl-6 font-mono text-gray-500">{w.id.substring(0, 8)}...</td>
                              <td className="p-3 font-semibold text-gray-800">{w.eventType}</td>
                              <td className="p-3 text-gray-500">{new Date(w.receivedAt).toLocaleString('vi-VN')}</td>
                              <td className="p-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  w.status === 'SUCCESS' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="p-3 text-center font-mono text-gray-500">{w.processingTimeMs || '-'}</td>
                              <td className="p-3 text-gray-400 max-w-[200px] truncate" title={w.errorLog}>
                                {w.errorLog || <span className="text-gray-300 italic">Không có lỗi</span>}
                              </td>
                            </tr>
                          ))}
                          {healthData.webhooks.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-gray-400 italic">
                                Không có bản ghi webhook nào trong cơ sở dữ liệu.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}

                    {healthLogTab === 'audit' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-gray-400 font-bold border-b border-gray-150 uppercase tracking-wider text-[10px]">
                            <th className="p-3.5 pl-6">ID</th>
                            <th className="p-3.5">Bảng dữ liệu</th>
                            <th className="p-3.5">Hành động</th>
                            <th className="p-3.5">Người thực hiện</th>
                            <th className="p-3.5">Thời gian thực hiện</th>
                          </tr>
                        </thead>
                        <tbody>
                          {healthData.auditLogs.map((a: any) => (
                            <tr key={a.id} className="border-b border-gray-100 hover:bg-slate-50/50">
                              <td className="p-3 pl-6 font-mono text-gray-500">{a.id.substring(0, 8)}...</td>
                              <td className="p-3 font-semibold text-gray-800">{a.entityType}</td>
                              <td className="p-3 text-gray-700 font-bold capitalize">{a.action}</td>
                              <td className="p-3 font-semibold text-blue-700">{a.userName}</td>
                              <td className="p-3 text-gray-500">{new Date(a.createdAt).toLocaleString('vi-VN')}</td>
                            </tr>
                          ))}
                          {healthData.auditLogs.length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-8 text-gray-400 italic">
                                Không có bản ghi lịch sử thay đổi nào.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: SOP Onboarding Flow Viewport */}
          {activeTab === 'sop' && (
            <div className="flex-1 overflow-auto p-8 flex flex-col gap-6" style={{ minWidth: '960px' }}>
              
              {/* Select SOP Control Header */}
              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="max-w-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">Bản đồ SOP tương tác</span>
                  <h3 className="font-bold text-gray-800 text-lg mt-2">{currentSop.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{currentSop.description}</p>
                </div>
                
                {/* SOP Dropdown */}
                <div className="flex flex-col gap-1.5 min-w-[280px]">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Lựa chọn Quy trình SOP</span>
                  <select
                    value={selectedSop}
                    onChange={(e: any) => { setSelectedSop(e.target.value); setDetailNode(null); }}
                    className="form-select text-xs font-bold text-gray-700 bg-slate-50 border-gray-200 rounded-xl py-2 px-3 focus:bg-white transition-all shadow-sm cursor-pointer"
                  >
                    <option value="leak">Quy trình rò rỉ nước (Khẩn cấp)</option>
                    <option value="install">Quy trình lắp máy lọc mới</option>
                    <option value="assign">Quy trình phân ca (Điều phối)</option>
                  </select>
                </div>
              </div>

              {/* Steps Graph Layout */}
              <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm flex-1 flex flex-col justify-center items-center min-h-[350px]">
                <div className="w-full max-w-[850px] relative flex justify-between items-center py-12">
                  
                  {/* SVG connections for steps */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                    {currentSop.steps.slice(0, -1).map((_: any, idx: number) => {
                      const totalSteps = currentSop.steps.length;
                      const startX = 60 + (idx * (850 - 120) / (totalSteps - 1)) + 60;
                      const endX = 60 + ((idx + 1) * (850 - 120) / (totalSteps - 1));
                      const y = 80;
                      return (
                        <g key={`sop-link-${idx}`}>
                          {/* Core Arrow Line */}
                          <line 
                            x1={startX} 
                            y1={y} 
                            x2={endX} 
                            y2={y} 
                            stroke="#3b82f6" 
                            strokeWidth="2.5" 
                            strokeDasharray="6 4"
                            className="flow-line"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Step nodes rendering */}
                  {currentSop.steps.map((step: any, idx: number) => {
                    const totalSteps = currentSop.steps.length;
                    const positionX = 60 + (idx * (850 - 120) / (totalSteps - 1));
                    const isSelected = detailNode?.type === 'sopStep' && detailNode.data.id === step.id;

                    return (
                      <div
                        key={step.id}
                        onClick={() => setDetailNode({ type: 'sopStep', data: { ...step, sopKey: selectedSop } })}
                        className={`absolute w-[120px] h-[90px] rounded-2xl border-2 bg-white flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all p-2 text-center shadow-md select-none ${
                          isSelected ? 'border-emerald-500 bg-emerald-50/20' : 'border-blue-500 hover:border-blue-600'
                        }`}
                        style={{ left: `${positionX}px`, top: '35px', zIndex: 10 }}
                      >
                        <div className={`p-2 rounded-xl text-white ${isSelected ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                          {step.icon}
                        </div>
                        <h4 className="font-bold text-[10px] text-gray-800 mt-2 truncate w-full px-1">{step.title}</h4>
                        <span className="text-[8px] font-black uppercase text-gray-400 mt-0.5">{step.role}</span>
                      </div>
                    );
                  })}

                </div>

                <div className="text-center text-slate-400 text-xs mt-12 max-w-md">
                  💡 Click vào từng bước trong quy trình phía trên để xem **hướng dẫn thao tác chuẩn**, bộ phận phụ trách và **danh sách đầu việc (checklist)** chi tiết.
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: Codebase Visualizer Viewport */}
          {activeTab === 'code' && (
            <div className="flex-1 flex flex-col p-6 gap-6" style={{ minWidth: '960px' }}>
              
              {/* Code Sub-tabs Header */}
              <div className="bg-white rounded-3xl border border-gray-200 p-4 shadow-sm flex justify-between items-center z-10">
                <div className="flex items-center gap-2 pl-2">
                  <Cpu size={18} className="text-indigo-600 animate-pulse" />
                  <span className="font-bold text-sm text-gray-800">Bản đồ cấu trúc mã nguồn dự án (Molecular View)</span>
                </div>

                {/* Sub-tabs switcher */}
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => { setCodeTab('db'); setDetailNode(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                      codeTab === 'db' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Database size={13} />
                    Sơ đồ CSDL (Prisma ERD)
                  </button>
                  <button
                    onClick={() => { setCodeTab('files'); setDetailNode(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                      codeTab === 'files' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <FileSpreadsheet size={13} />
                    Cây tệp tin (Folder Tree)
                  </button>
                  <button
                    onClick={() => { setCodeTab('api'); setDetailNode(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                      codeTab === 'api' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Terminal size={13} />
                    Bản đồ API (Backend Routers)
                  </button>
                  <button
                    onClick={() => { setCodeTab('ua'); setDetailNode(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                      codeTab === 'ua' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <BookOpen size={13} />
                    Understand Anything
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: Database Prisma ERD */}
              {codeTab === 'db' && (
                <div className="bg-slate-950 rounded-3xl border border-slate-900 p-6 flex-1 relative min-h-[500px] overflow-auto erd-scrollbar select-none">
                  
                  {/* ERD SVG connections layer */}
                  <svg className="absolute inset-0 pointer-events-none" style={{ width: '1000px', height: '580px', zIndex: 0 }}>
                    {/* Connections */}
                    {[
                      { from: 'MainStation', to: 'TechStation', fromX: 140, fromY: 155, toX: 140, toY: 280, type: '1-N' },
                      { from: 'MainStation', to: 'Order', fromX: 230, fromY: 90, toX: 520, toY: 200, type: '1-N' },
                      { from: 'TechStation', to: 'User', fromX: 230, fromY: 330, toX: 285, toY: 250, type: '1-N' },
                      { from: 'TechStation', to: 'Order', fromX: 230, fromY: 345, toX: 520, toY: 290, type: '1-N' },
                      { from: 'User', to: 'Order', fromX: 465, fromY: 250, toX: 520, toY: 250, type: '1-N' },
                      { from: 'User', to: 'ServiceReport', fromX: 465, fromY: 220, toX: 775, toY: 100, type: '1-N' },
                      { from: 'User', to: 'Feedback', fromX: 375, fromY: 335, toX: 375, toY: 450, type: '1-N' },
                      { from: 'Order', to: 'ServiceReport', fromX: 700, fromY: 200, toX: 775, toY: 80, type: '1-N' },
                      { from: 'Order', to: 'OrderItem', fromX: 700, fromY: 230, toX: 775, toY: 280, type: '1-N' },
                      { from: 'OrderItem', to: 'Product', fromX: 865, fromY: 350, toX: 865, toY: 440, type: 'N-1' }
                    ].map((link, idx) => {
                      const isHovered = hoveredModel === link.from || hoveredModel === link.to;
                      const isActive = detailNode?.type === 'codeModel' && (detailNode.data.id === link.from || detailNode.data.id === link.to);
                      
                      return (
                        <g key={`erd-link-${idx}`}>
                          <path
                            d={`M ${link.fromX} ${link.fromY} C ${(link.fromX + link.toX)/2} ${link.fromY}, ${(link.fromX + link.toX)/2} ${link.toY}, ${link.toX} ${link.toY}`}
                            stroke={isActive ? '#38bdf8' : isHovered ? '#34d399' : '#334155'}
                            strokeWidth={isActive ? '2.5' : isHovered ? '2' : '1.5'}
                            fill="none"
                            opacity={isActive ? 1 : isHovered ? 0.8 : 0.4}
                            className={isActive ? 'flow-line' : undefined}
                            strokeDasharray={isActive ? '5 3' : undefined}
                            style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Render Model Cards */}
                  <div className="relative" style={{ width: '1000px', height: '580px' }}>
                    {erdModels.map((model) => {
                      const isSelected = detailNode?.type === 'codeModel' && detailNode.data.id === model.id;
                      
                      return (
                        <div
                          key={model.id}
                          onClick={() => setDetailNode({ type: 'codeModel', data: model })}
                          onMouseEnter={() => setHoveredModel(model.id)}
                          onMouseLeave={() => setHoveredModel(null)}
                          className={`absolute w-[180px] rounded-xl border flex flex-col overflow-hidden cursor-pointer hover:scale-[1.03] transition-all select-none ${
                            isSelected 
                              ? 'border-sky-500 shadow-[0_0_15px_rgba(56,189,248,0.25)] bg-slate-900' 
                              : hoveredModel === model.id
                                ? 'border-emerald-500 shadow-[0_0_15px_rgba(52,211,153,0.2)] bg-slate-900'
                                : 'border-slate-800 bg-slate-950/80'
                          }`}
                          style={{ left: `${model.x}px`, top: `${model.y}px`, zIndex: isSelected ? 10 : 5 }}
                        >
                          {/* Card Header */}
                          <div className={`px-3 py-2 border-b font-bold text-[10px] uppercase flex items-center justify-between ${
                            isSelected ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}>
                            <span>{model.name.split(' ')[0]}</span>
                            <Database size={11} className={isSelected ? 'text-sky-400' : 'text-slate-500'} />
                          </div>

                          {/* Card Body (Fields list) */}
                          <div className="p-2 flex flex-col gap-1 text-[9px] font-mono text-left">
                            {model.fields.map((f, fIdx) => (
                              <div key={fIdx} className="flex justify-between items-center gap-1.5 py-0.5 border-b border-slate-900/30">
                                <span className={f.key ? 'text-yellow-500 font-bold' : 'text-slate-300'}>
                                  {f.name}{f.key && ' 🔑'}
                                </span>
                                <span className="text-slate-500 shrink-0">{f.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

              {/* Sub-tab 2: Project Files Tree */}
              {codeTab === 'files' && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 flex-1 overflow-auto min-h-[500px]">
                  
                  {/* Tree Renderer helper */}
                  <div className="max-w-xl mx-auto border border-gray-100 rounded-2xl p-4 bg-slate-50/50">
                    <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider mb-4 pl-1 flex items-center gap-1.5">
                      <FileSpreadsheet size={15} />
                      Sơ đồ thư mục dự án
                    </h4>

                    {/* Recursive tree implementation */}
                    <div className="flex flex-col gap-1 font-mono text-xs text-left">
                      {/* Root node */}
                      <div>
                        <div 
                          onClick={() => toggleFolder('root')}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-800 font-bold"
                        >
                          <span>{expandedFolders['root'] !== false ? '📂' : '📁'}</span>
                          <span>{filesTree.name}</span>
                        </div>

                        {/* Level 1 children */}
                        {expandedFolders['root'] !== false && (
                          <div className="pl-6 border-l border-gray-200 ml-3 flex flex-col gap-1 mt-1">
                            {filesTree.children.map((child, idx) => {
                              const isFolder = child.type === 'folder';
                              const isExpanded = expandedFolders[child.key || ''] !== false;

                              if (isFolder) {
                                return (
                                  <div key={idx}>
                                    <div 
                                      onClick={() => toggleFolder(child.key || '')}
                                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-700 font-bold"
                                    >
                                      <span>{isExpanded ? '📂' : '📁'}</span>
                                      <span>{child.name}</span>
                                    </div>

                                    {/* Level 2 children */}
                                    {isExpanded && child.children && (
                                      <div className="pl-6 border-l border-gray-200 ml-3 flex flex-col gap-1 mt-1">
                                        {child.children.map((subChild, sIdx) => {
                                          const isSubFolder = subChild.type === 'folder';
                                          const isSubExpanded = expandedFolders[subChild.key || ''] !== false;

                                          if (isSubFolder) {
                                            return (
                                              <div key={sIdx}>
                                                <div 
                                                  onClick={() => toggleFolder(subChild.key || '')}
                                                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-600 font-semibold"
                                                >
                                                  <span>{isSubExpanded ? '📂' : '📁'}</span>
                                                  <span>{subChild.name}</span>
                                                </div>

                                                {/* Level 3 children */}
                                                {isSubExpanded && subChild.children && (
                                                  <div className="pl-6 border-l border-gray-200 ml-3 flex flex-col gap-1 mt-1">
                                                    {subChild.children.map((file, fIdx) => (
                                                      <div 
                                                        key={fIdx}
                                                        onClick={() => setDetailNode({ type: 'codeFile', data: file })}
                                                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer text-gray-500 font-medium"
                                                      >
                                                        <span>📄</span>
                                                        <span>{file.name}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div 
                                                key={sIdx}
                                                onClick={() => setDetailNode({ type: 'codeFile', data: subChild })}
                                                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer text-gray-500 font-medium"
                                              >
                                                <span>📄</span>
                                                <span>{subChild.name}</span>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <div 
                                    key={idx}
                                    onClick={() => setDetailNode({ type: 'codeFile', data: child })}
                                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer text-gray-500 font-medium"
                                  >
                                    <span>📄</span>
                                    <span>{child.name}</span>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Sub-tab 3: Backend API Routers Map */}
              {codeTab === 'api' && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 flex-1 overflow-auto min-h-[500px]">
                  
                  <div className="max-w-4xl mx-auto flex flex-col gap-6 text-left">
                    {apiRouters.map((router, rIdx) => (
                      <div key={rIdx} className="bg-slate-50 border border-gray-150 rounded-2xl p-5 shadow-sm">
                        <h4 className="font-bold text-sm text-gray-800 border-b border-gray-200 pb-2 flex items-center gap-2">
                          <Terminal size={15} className="text-indigo-600" />
                          {router.name}
                        </h4>
                        
                        {/* Endpoints List */}
                        <div className="flex flex-col gap-2 mt-4">
                          {router.endpoints.map((ep, eIdx) => (
                            <div 
                              key={eIdx}
                              onClick={() => setDetailNode({ type: 'codeApi', data: ep })}
                              className="p-3 bg-white border border-gray-100 hover:border-indigo-300 rounded-xl cursor-pointer transition-all flex justify-between items-center text-xs group"
                            >
                              <div className="flex items-center gap-3">
                                {/* Badge Method */}
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-center w-14 shrink-0 ${
                                  ep.method === 'GET' ? 'bg-green-50 text-green-700 border border-green-200' :
                                  ep.method === 'POST' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  ep.method === 'PATCH' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {ep.method}
                                </span>
                                <span className="font-bold font-mono text-gray-800 group-hover:text-indigo-600">{ep.path}</span>
                              </div>
                              <span className="text-gray-400 max-w-[350px] truncate text-[11px] font-medium">{ep.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )}

              {/* Sub-tab 4: Understand Anything Repo Analysis */}
              {codeTab === 'ua' && (
                <div className="flex flex-1 gap-6 min-h-[600px] text-left">
                  {/* Left Column: Interactive Network Graph */}
                  <div className="flex-1 bg-[#0c0a09] rounded-3xl border border-stone-850 p-6 relative flex flex-col justify-between select-none overflow-hidden" style={{ minHeight: '680px' }}>
                    
                    {/* Floating Info */}
                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded w-fit">
                        Understand Anything Graph
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        Di chuột vào các node để xem liên kết dependencies. Nhấn "Start Guided Tour" để chạy hướng dẫn từng bước.
                      </span>
                    </div>

                    {/* SVG Canvas */}
                    <svg className="w-full h-full min-h-[500px] z-0">
                      {/* Definitions for arrow markers */}
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3f3f46" />
                        </marker>
                      </defs>

                      {/* Connections */}
                      {UA_EDGES.map((edge, idx) => {
                        const fromNode = UA_NODES.find(n => n.id === edge.from);
                        const toNode = UA_NODES.find(n => n.id === edge.to);
                        if (!fromNode || !toNode) return null;

                        const isHighlighted = hoveredUaNode === edge.from || hoveredUaNode === edge.to;
                        const isTourActive = tourStep >= 0;
                        const isTourEdge = isTourActive && 
                          UA_TOUR_STEPS[tourStep]?.nodeId === edge.to && 
                          (tourStep > 0 ? UA_TOUR_STEPS[tourStep - 1]?.nodeId === edge.from : false);

                        return (
                          <g key={`ua-edge-${idx}`}>
                            <path
                              d={`M ${fromNode.x} ${fromNode.y} C ${(fromNode.x + toNode.x)/2} ${fromNode.y}, ${(fromNode.x + toNode.x)/2} ${toNode.y}, ${toNode.x} ${toNode.y}`}
                              stroke={isTourEdge ? '#f59e0b' : isHighlighted ? '#38bdf8' : '#27272a'}
                              strokeWidth={isTourEdge ? 3 : isHighlighted ? 2.5 : 1.5}
                              fill="none"
                              opacity={isTourActive ? (isTourEdge ? 1 : 0.1) : (isHighlighted ? 0.9 : 0.3)}
                              strokeDasharray={isTourEdge || isHighlighted ? '5 3' : undefined}
                              className={(isTourEdge || isHighlighted) ? 'flow-line' : undefined}
                              style={{ transition: 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s' }}
                            />
                          </g>
                        );
                      })}

                      {/* Nodes */}
                      {UA_NODES.map((node) => {
                        const isHovered = hoveredUaNode === node.id;
                        const isTourActive = tourStep >= 0;
                        const isTourNode = isTourActive && UA_TOUR_STEPS[tourStep]?.nodeId === node.id;
                        const tourIndex = UA_TOUR_STEPS.findIndex(s => s.nodeId === node.id);

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => !isTourActive && setHoveredUaNode(node.id)}
                            onMouseLeave={() => !isTourActive && setHoveredUaNode(null)}
                            className="cursor-pointer"
                            onClick={() => {
                              if (isTourActive && tourIndex !== -1) {
                                setTourStep(tourIndex);
                              } else {
                                setDetailNode({ type: 'codeFile', data: { name: node.label, desc: node.desc, connections: 6 } });
                              }
                            }}
                          >
                            {/* Pulsing Outer Ring */}
                            {(isHovered || isTourNode) && (
                              <circle
                                r={node.size + 8}
                                fill="none"
                                stroke={isTourNode ? '#f59e0b' : '#38bdf8'}
                                strokeWidth="2"
                                opacity="0.6"
                                className="animate-ping"
                              />
                            )}

                            {/* Main Node Circle */}
                            <circle
                              r={node.size}
                              fill={isTourNode ? '#f59e0b' : node.category === 'entry' ? '#4f46e5' : node.category === 'db' ? '#0891b2' : node.category === 'route' ? '#0284c7' : node.category === 'service' ? '#059669' : '#52525b'}
                              stroke={(isHovered || isTourNode) ? '#ffffff' : '#27272a'}
                              strokeWidth="2"
                              opacity={isTourActive ? (isTourNode ? 1 : 0.4) : 1}
                              style={{ transition: 'fill 0.3s, stroke 0.3s, opacity 0.3s' }}
                            />

                            {/* Node Emoji */}
                            <text
                              textAnchor="middle"
                              dy=".3em"
                              fontSize="11px"
                              opacity={isTourActive ? (isTourNode ? 1 : 0.4) : 1}
                            >
                              {node.category === 'entry' ? '🚀' : node.category === 'db' ? '💾' : node.category === 'route' ? '📡' : node.category === 'service' ? '⚙️' : '📄'}
                            </text>

                            {/* Text Label */}
                            <text
                              y={node.size + 14}
                              textAnchor="middle"
                              fill={isTourNode ? '#f59e0b' : (isHovered ? '#ffffff' : '#a1a1aa')}
                              fontSize="9px"
                              fontWeight={isTourNode ? 'bold' : 'normal'}
                              opacity={isTourActive ? (isTourNode ? 1 : 0.3) : 1}
                              style={{ transition: 'fill 0.3s, opacity 0.3s' }}
                            >
                              {node.id}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Floating Tour Popover */}
                    {tourStep >= 0 && (
                      <div className="absolute bottom-6 left-6 right-6 bg-stone-900 border border-stone-850 rounded-2xl p-5 shadow-2xl flex flex-col gap-3 text-left animate-slide-up z-10">
                        <div className="flex justify-between items-center border-b border-stone-800 pb-2">
                          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                            ✨ HƯỚNG DẪN ĐỌC CODE — {tourStep + 1}/{UA_TOUR_STEPS.length}
                          </span>
                          <button 
                            type="button"
                            onClick={() => setTourStep(-1)}
                            className="text-zinc-500 hover:text-white text-xs"
                          >
                            Đóng Tour
                          </button>
                        </div>
                        <h4 className="font-bold text-white text-xs">
                          {UA_TOUR_STEPS[tourStep].title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          {UA_TOUR_STEPS[tourStep].desc}
                        </p>
                        <div className="flex justify-between items-center mt-2">
                          <button
                            type="button"
                            onClick={() => setTourStep(prev => Math.max(0, prev - 1))}
                            disabled={tourStep === 0}
                            className="px-3 py-1 bg-stone-800 border border-stone-750 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                          >
                            Quay lại
                          </button>
                          <div className="flex gap-2">
                            {tourStep < UA_TOUR_STEPS.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => setTourStep(prev => prev + 1)}
                                className="px-4 py-1 bg-amber-500 text-stone-950 font-bold rounded text-xs hover:bg-amber-400 transition-colors"
                              >
                                Tiếp theo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setTourStep(-1)}
                                className="px-4 py-1 bg-emerald-500 text-white font-bold rounded text-xs hover:bg-emerald-400 transition-colors"
                              >
                                Hoàn thành 🎉
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Information Panel */}
                  <div className="w-80 shrink-0 bg-[#161615] rounded-3xl border border-stone-850 flex flex-col overflow-hidden text-zinc-300 font-sans shadow-xl">
                    
                    {/* Tab Selection */}
                    <div className="flex bg-stone-900/50 p-1 border-b border-stone-850">
                      <button 
                        type="button"
                        onClick={() => setUaTab('info')}
                        className={`flex-1 text-center py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                          uaTab === 'info' 
                            ? 'bg-stone-850 text-white rounded-lg shadow-sm border border-stone-750/50' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        INFO
                      </button>
                      <button 
                        type="button"
                        onClick={() => setUaTab('files')}
                        className={`flex-1 text-center py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                          uaTab === 'files' 
                            ? 'bg-stone-850 text-white rounded-lg shadow-sm border border-stone-750/50' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        FILES
                      </button>
                    </div>

                    {/* Tab Body */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 text-left custom-dark-scrollbar">
                      {uaTab === 'info' && (
                        <>
                          {/* Summary Stats Grid */}
                          <div className="grid grid-cols-2 gap-2.5">
                            {[
                              { val: 750, label: 'NODES' },
                              { val: 725, label: 'EDGES' },
                              { val: 10, label: 'LAYERS' },
                              { val: 8, label: 'TYPES' }
                            ].map((stat, sIdx) => (
                              <div key={sIdx} className="bg-stone-900/40 border border-stone-850 p-3 rounded-xl flex flex-col gap-0.5">
                                <span className="text-xl font-black text-amber-500 font-mono leading-none">{stat.val}</span>
                                <span className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">{stat.label}</span>
                              </div>
                            ))}
                          </div>

                          {/* File Types Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">FILE TYPES</h5>
                            <div className="flex flex-col gap-1 text-xs">
                              {[
                                { name: 'Code', count: 634, dotColor: 'bg-blue-500' },
                                { name: 'Config', count: 27, dotColor: 'bg-cyan-400' },
                                { name: 'Docs', count: 58, dotColor: 'bg-sky-400' },
                                { name: 'Infra', count: 13, dotColor: 'bg-purple-500' },
                                { name: 'Data', count: 18, dotColor: 'bg-emerald-400' }
                              ].map((ft, ftIdx) => (
                                <div key={ftIdx} className="flex justify-between items-center py-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${ft.dotColor}`} />
                                    <span className="text-zinc-300">{ft.name}</span>
                                  </div>
                                  <span className="font-mono text-zinc-400 font-bold">{ft.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Languages Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">LANGUAGES</h5>
                            <div className="flex flex-wrap gap-1.5">
                              {['config', 'css', 'dockerfile', 'javascript', 'json', 'markdown', 'python', 'shell', 'sql', 'toml', 'typescript', 'yaml'].map(lang => (
                                <span key={lang} className="bg-stone-900 border border-stone-850 text-[10px] px-2 py-0.5 rounded text-zinc-300 font-mono">
                                  {lang}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Frameworks Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">FRAMEWORKS</h5>
                            <div className="flex flex-wrap gap-1.5">
                              {['Caddy', 'Docker', 'Docker Compose', 'Drizzle', 'GitHub Actions', 'MCP', 'Next.js', 'React', 'Tailwind', 'Turborepo', 'Vitest'].map(fw => (
                                <span key={fw} className="bg-stone-900/60 border border-stone-800 text-[10px] px-2 py-0.5 rounded text-zinc-400 font-mono font-semibold">
                                  {fw}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Node Type Distribution Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">NODE TYPE DISTRIBUTION</h5>
                            <div className="flex flex-col gap-2 text-[11px]">
                              {[
                                { name: 'File', count: 397, pct: 53 },
                                { name: 'Function', count: 226, pct: 30 },
                                { name: 'Document', count: 58, pct: 8 },
                                { name: 'Config', count: 27, pct: 4 },
                                { name: 'Table', count: 18, pct: 2 },
                                { name: 'Class', count: 11, pct: 1 },
                                { name: 'Pipeline', count: 7, pct: 1 },
                                { name: 'Service', count: 6, pct: 1 }
                              ].map((dist, dIdx) => (
                                <div key={dIdx} className="flex flex-col gap-1">
                                  <div className="flex justify-between text-zinc-400 text-[10px]">
                                    <span className="font-semibold">{dist.name}</span>
                                    <span className="font-mono text-zinc-500">{dist.count} ({dist.pct}%)</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-stone-900 rounded overflow-hidden">
                                    <div 
                                      className="h-full bg-amber-500/80 rounded" 
                                      style={{ width: `${dist.pct}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Complexity Distribution Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">COMPLEXITY DISTRIBUTION</h5>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-stone-900/50 border border-stone-850 p-2 rounded-xl flex flex-col gap-0.5">
                                <span className="text-sm font-black text-emerald-400 font-mono">280</span>
                                <span className="text-[8px] font-bold text-zinc-500 uppercase">SIMPLE</span>
                              </div>
                              <div className="bg-stone-900/50 border border-stone-850 p-2 rounded-xl flex flex-col gap-0.5">
                                <span className="text-sm font-black text-amber-400 font-mono">254</span>
                                <span className="text-[8px] font-bold text-zinc-500 uppercase">MODERATE</span>
                              </div>
                              <div className="bg-stone-900/50 border border-stone-850 p-2 rounded-xl flex flex-col gap-0.5">
                                <span className="text-sm font-black text-rose-400 font-mono">216</span>
                                <span className="text-[8px] font-bold text-zinc-500 uppercase">COMPLEX</span>
                              </div>
                            </div>
                          </div>

                          {/* Most Connected Nodes Section */}
                          <div className="flex flex-col gap-2">
                            <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">MOST CONNECTED NODES</h5>
                            <div className="flex flex-col gap-1.5">
                              {[
                                { name: 'src/routes/orders.ts', count: 28 },
                                { name: 'src/index.ts', count: 19 },
                                { name: 'src/services/orderProcessor.ts', count: 16 },
                                { name: 'prisma/schema.prisma', count: 13 },
                                { name: 'src/services/eventRouter.ts', count: 11 }
                              ].map((node, nIdx) => (
                                <div key={nIdx} className="flex justify-between items-center text-xs bg-stone-900/30 p-2 rounded-lg border border-stone-850/50">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-5 h-5 rounded-full bg-stone-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">
                                      {nIdx + 1}
                                    </span>
                                    <span className="text-zinc-300 font-mono truncate text-[11px]">{node.name}</span>
                                  </div>
                                  <span className="font-mono text-amber-500 font-bold pl-2 shrink-0">{node.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Footer Stats */}
                          <div className="border-t border-stone-800 pt-3 mt-1 flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                            <span>Avg Connections per Node</span>
                            <span className="font-bold text-zinc-300 text-xs">1.9</span>
                          </div>
                          <div className="text-[9px] text-zinc-600 font-mono leading-none -mt-2">
                            Analyzed: {new Date().toLocaleDateString('vi-VN')}
                          </div>

                          {/* Guided Tour trigger */}
                          <button
                            type="button"
                            onClick={() => setTourStep(0)}
                            className="w-full mt-2 py-2.5 bg-stone-800 hover:bg-stone-700 text-amber-500 hover:text-amber-400 font-bold border border-stone-750 hover:border-stone-700 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-inner"
                          >
                            ✨ Start Guided Tour
                          </button>
                        </>
                      )}

                      {uaTab === 'files' && (
                        <div className="flex flex-col gap-4">
                          {/* File Search */}
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-zinc-500">
                              <Search size={13} />
                            </span>
                            <input
                              type="text"
                              className="w-full pl-8 pr-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              placeholder="Search files..."
                              value={uaSearchQuery}
                              onChange={e => setUaSearchQuery(e.target.value)}
                            />
                          </div>

                          {/* Files List */}
                          <div className="flex flex-col gap-2">
                            {UA_FILES_LIST.filter(f => f.name.toLowerCase().includes(uaSearchQuery.toLowerCase())).map((file, fIdx) => (
                              <div 
                                key={fIdx} 
                                onClick={() => setDetailNode({ type: 'codeFile', data: { name: file.name, desc: file.desc, connections: file.connections } })}
                                className="p-3 bg-stone-900/40 border border-stone-850 hover:border-amber-500/30 rounded-xl cursor-pointer transition-all flex flex-col gap-1.5 text-left"
                              >
                                <div className="flex justify-between items-center gap-2">
                                  <span className="font-mono text-zinc-200 text-xs truncate">{file.name}</span>
                                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0 ${file.color}`}>
                                    {file.complexity}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                                  <span>Lines: {file.lines}</span>
                                  <span>Connections: {file.connections}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: Detail Slide-out Drawer Panel (Accessible to all tabs) */}
          {detailNode && (
            <div className="w-96 border-l border-gray-200 bg-white shadow-2xl flex flex-col z-20 animate-fade-in relative">
              {/* Drawer Header */}
              <div className="p-5 bg-slate-50 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {detailNode.type === 'main' && <Building2 className="text-blue-600" size={20} />}
                  {detailNode.type === 'tech' && <MapPin className="text-blue-500" size={20} />}
                  {detailNode.type === 'user' && <User className="text-emerald-600" size={20} />}
                  {detailNode.type === 'service' && <Activity className="text-blue-600" size={20} />}
                  {detailNode.type === 'sopStep' && <BookOpen className="text-emerald-600" size={20} />}
                  {detailNode.type === 'codeModel' && <Database className="text-indigo-600" size={20} />}
                  {detailNode.type === 'codeFile' && <FileSpreadsheet className="text-slate-600" size={20} />}
                  {detailNode.type === 'codeApi' && <Terminal className="text-blue-600" size={20} />}
                  <h3 className="font-bold text-gray-800 text-sm">
                    {detailNode.type === 'main' && 'Thông tin Trạm chính'}
                    {detailNode.type === 'tech' && 'Thông tin Trạm kỹ thuật'}
                    {detailNode.type === 'user' && 'Chi tiết nhân sự'}
                    {detailNode.type === 'service' && 'Thông số sức khỏe kết nối'}
                    {detailNode.type === 'sopStep' && 'Chi tiết bước nghiệp vụ'}
                    {detailNode.type === 'codeModel' && 'Chi tiết cấu trúc Model'}
                    {detailNode.type === 'codeFile' && 'Thông tin Tệp tin'}
                    {detailNode.type === 'codeApi' && 'Định nghĩa API Endpoint'}
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
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Tên đăng nhập</span>
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

                {/* 4. Service (Health) Details */}
                {detailNode.type === 'service' && (
                  <>
                    <div>
                      <h4 className="font-black text-xl text-gray-900 leading-tight">{detailNode.data.name}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md ${
                          detailNode.data.status === 'healthy' ? 'bg-green-100 text-green-800' : detailNode.data.status === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {detailNode.data.status === 'healthy' ? 'Kết nối tốt' : detailNode.data.status === 'warning' ? 'Cảnh báo' : 'Lỗi kết nối'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 text-xs">
                      {detailNode.data.key === 'server' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Tải bộ nhớ RAM:</span>
                              <span className="font-bold text-gray-800">{detailNode.data.memory} MB</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Thời gian hoạt động (Uptime):</span>
                              <span className="font-bold text-gray-800">{detailNode.data.uptime} giây</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Môi trường:</span>
                              <span className="font-mono bg-slate-200 px-1 py-0.5 rounded text-[10px] text-slate-700">Production</span>
                            </div>
                          </div>
                        </>
                      )}

                      {detailNode.data.key === 'database' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Thời gian phản hồi (Ping):</span>
                              <span className="font-bold text-gray-800">{detailNode.data.pingMs} ms</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Công nghệ ORM:</span>
                              <span className="font-semibold text-blue-700">Prisma Client</span>
                            </div>
                          </div>
                          {detailNode.data.error && (
                            <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700">
                              <div className="font-bold flex items-center gap-1.5 mb-1">
                                <AlertCircle size={14} /> Lỗi kết nối CSDL:
                              </div>
                              <p className="font-mono text-[10px] break-words leading-relaxed">{detailNode.data.error}</p>
                            </div>
                          )}
                        </>
                      )}

                      {detailNode.data.key === 'pancake' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Thời gian phản hồi (Ping):</span>
                              <span className="font-bold text-gray-800">{detailNode.data.pingMs} ms</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Cửa hàng ID (Shop ID):</span>
                              <span className="font-mono bg-slate-200 px-1 py-0.5 rounded text-[10px] text-slate-700">{detailNode.data.shopId}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">API Key trong .env:</span>
                              <span className="font-bold text-green-600">Đã cấu hình</span>
                            </div>
                          </div>
                          {detailNode.data.error && (
                            <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700">
                              <div className="font-bold flex items-center gap-1.5 mb-1">
                                <AlertCircle size={14} /> Chi tiết lỗi:
                              </div>
                              <p className="font-mono text-[10px] break-words leading-relaxed">{detailNode.data.error}</p>
                            </div>
                          )}
                        </>
                      )}

                      {detailNode.data.key === 'firebase' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-xl border border-gray-150 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Phương thức xác thực:</span>
                              <span className="font-bold text-blue-700">{detailNode.data.provider}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-semibold">Trạng thái SDK:</span>
                              <span className="font-bold text-green-600">Đang hoạt động (Initialized)</span>
                            </div>
                          </div>
                          {detailNode.data.error && (
                            <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-amber-700">
                              <div className="font-bold flex items-center gap-1.5 mb-1">
                                <AlertCircle size={14} /> Lưu ý:
                              </div>
                              <p className="text-[10px] leading-relaxed">{detailNode.data.error}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* 5. SOP Step Details */}
                {detailNode.type === 'sopStep' && (
                  <>
                    <div>
                      <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-50 text-blue-700 border border-blue-100 mb-2">
                        Bộ phận: {detailNode.data.role}
                      </span>
                      <h4 className="font-black text-xl text-gray-900 leading-tight">{detailNode.data.title}</h4>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{detailNode.data.desc}</p>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Danh mục đầu việc (Checklist):</h5>
                      
                      <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-2xl border border-gray-150">
                        {detailNode.data.sopKey === 'leak' && (
                          <>
                            {detailNode.data.id === 1 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Ghi nhận SĐT, tên KH và địa chỉ cụ thể</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Hỏi rõ mức độ nước tràn (ngập sàn, ẩm nhẹ)</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Xác định dòng máy lọc nước đang sử dụng</span></div>
                              </>
                            )}
                            {detailNode.data.id === 2 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span> van khóa nước cấp đầu vào và ngắt nguồn điện máy lọc</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Hướng dẫn KH ngắt phích điện an toàn</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Hướng dẫn khóa nước đầu nguồn vào cấp cho máy lọc</span></div>
                              </>
                            )}
                            {detailNode.data.id === 3 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Tìm kiếm KTV đang rảnh ở gần khách hàng nhất</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Bấm chỉ định KTV xử lý ca khẩn cấp trên hệ thống</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Gọi điện đôn đốc KTV di chuyển gấp đến điểm hẹn</span></div>
                              </>
                            )}
                            {detailNode.data.id === 4 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>KTV có mặt kiểm tra vị trí rò rỉ nước (tại co cút, cốc lọc, bình áp...)</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Tháo rời và thay mới các linh kiện co cút bị hỏng</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Lau dọn vệ sinh sạch nước ngập trên sàn và tủ máy</span></div>
                              </>
                            )}
                            {detailNode.data.id === 5 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>KTV chụp ảnh trước/sau sửa chữa nộp báo cáo ca hoàn thành</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Lấy chữ ký xác nhận của khách hàng trực tiếp trên App</span></div>
                              </>
                            )}
                          </>
                        )}
                        
                        {detailNode.data.sopKey === 'install' && (
                          <>
                            {detailNode.data.id === 1 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Xác nhận thông tin đơn lắp đặt từ Pancake</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Liên hệ khách hàng hẹn khung giờ kỹ thuật viên qua nhà</span></div>
                              </>
                            )}
                            {detailNode.data.id === 2 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Nhận thiết bị máy lọc mới nguyên kiện và vật tư phụ kiện</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Khai báo xác nhận xuất kho linh kiện trên app di động</span></div>
                              </>
                            )}
                            {detailNode.data.id === 3 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Định vị vị trí đặt máy, khoan lắp vòi nước trên chậu rửa</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Đấu nối chia nước đầu nguồn cấp cho máy, đường nước thải</span></div>
                              </>
                            )}
                            {detailNode.data.id === 4 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Thực hiện sục rửa lõi lọc thô 1, 2, 3 và màng lọc RO 15 phút</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Đo độ sạch tinh khiết của nước đầu ra (đảm bảo TDS dưới 50)</span></div>
                              </>
                            )}
                            {detailNode.data.id === 5 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Dán tem bảo hành, hướng dẫn khách thay thế lõi lọc định kỳ</span></div>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Khách ký biên bản nghiệm thu thiết bị hoạt động tốt</span></div>
                              </>
                            )}
                          </>
                        )}

                        {detailNode.data.sopKey === 'assign' && (
                          <>
                            {detailNode.data.id === 1 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Đơn hàng đổ về lưu CSDL dưới dạng Chờ xử lý</span></div>
                              </>
                            )}
                            {detailNode.data.id === 2 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Điều phối viên xác minh khu vực và phân bổ về Trạm phù hợp</span></div>
                              </>
                            )}
                            {detailNode.data.id === 3 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Gọi điện hẹn khách hàng và gán ca cho KTV trạm đó xử lý</span></div>
                              </>
                            )}
                            {detailNode.data.id === 4 && (
                              <>
                                <div className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" defaultChecked className="mt-0.5 cursor-not-allowed" disabled /> <span>Đôn đốc KTV hoàn thành ca và giám sát kết quả báo cáo nộp lên</span></div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 text-xs">
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Lưu ý quan trọng:</h5>
                      {detailNode.data.sopKey === 'leak' && detailNode.data.id === 2 && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 leading-relaxed">
                          ⚠️ Luôn hướng dẫn khách hàng **ngắt điện trước khi khóa nước** nếu nước tràn vào bảng mạch điện hoặc gần ổ cắm để tránh nguy cơ giật điện nguy hiểm.
                        </div>
                      )}
                      {detailNode.data.sopKey === 'install' && detailNode.data.id === 4 && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 leading-relaxed">
                          💡 Chỉ số TDS đo được đại diện cho tổng lượng chất rắn hòa tan trong nước. Tiêu chuẩn nước tinh khiết uống trực tiếp yêu cầu chỉ số TDS luôn **dưới 50 ppm**.
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* 6. Database Model Details */}
                {detailNode.type === 'codeModel' && (
                  <>
                    <div>
                      <h4 className="font-black text-lg text-gray-900 leading-tight flex items-center gap-2">
                        <Database size={18} className="text-indigo-600" />
                        {detailNode.data.name.split(' ')[0]}
                      </h4>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{detailNode.data.desc}</p>
                    </div>

                    {/* Attribute list */}
                    <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-4 text-xs">
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Chi tiết các Trường (Schema Fields):</h5>
                      
                      <div className="flex flex-col gap-2 bg-slate-50 p-3.5 rounded-2xl border border-gray-150 font-mono text-[9px] max-h-56 overflow-y-auto erd-scrollbar">
                        {detailNode.data.fields.map((f: any, idx: number) => (
                          <div key={idx} className="flex flex-col border-b border-gray-200/40 pb-1.5 last:border-0">
                            <div className="flex justify-between items-center font-bold">
                              <span className={f.key ? 'text-yellow-600' : 'text-slate-800'}>{f.name}</span>
                              <span className="text-indigo-600">{f.type}</span>
                            </div>
                            <span className="text-gray-400 font-sans mt-0.5">{f.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Prisma Code snippet */}
                    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
                      <h5 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Mã Prisma Schema:</h5>
                      <pre className="bg-slate-900 text-slate-300 font-mono text-[9px] p-3 rounded-2xl border border-slate-800 overflow-x-auto text-left leading-relaxed">
                        <code>{detailNode.data.prismaCode}</code>
                      </pre>
                    </div>
                  </>
                )}

                {/* 7. Code File Details */}
                {detailNode.type === 'codeFile' && (
                  <>
                    <div>
                      <h4 className="font-black text-lg text-gray-900 leading-tight flex items-center gap-2 truncate">
                        <span>📄</span>
                        <span className="truncate">{detailNode.data.name}</span>
                      </h4>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{detailNode.data.desc}</p>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 text-xs bg-slate-50 p-4 rounded-2xl border border-gray-150">
                      <div>
                        <span className="text-gray-400 block text-[9px] uppercase font-semibold">Đường dẫn đầy đủ:</span>
                        <span className="font-mono font-bold text-slate-700 break-all">{detailNode.data.key ? `truliva/${detailNode.data.key.replace(/_/g, '/')}` : detailNode.data.name}</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-gray-400 block text-[9px] uppercase font-semibold">Kiến trúc:</span>
                        <span className="font-semibold text-indigo-700">
                          {detailNode.data.name.endsWith('.yml') ? 'GitHub Actions CI/CD Pipeline' :
                           detailNode.data.name.endsWith('.prisma') ? 'Database Layer (Prisma ORM)' :
                           detailNode.data.name.endsWith('.tsx') ? 'React View Component (Vite)' : 'Express API Logic (Node.js)'}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* 8. Code API Details */}
                {detailNode.type === 'codeApi' && (
                  <>
                    <div>
                      <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mb-2 border ${
                        detailNode.data.method === 'GET' ? 'bg-green-50 text-green-700 border-green-200' :
                        detailNode.data.method === 'POST' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        detailNode.data.method === 'PATCH' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {detailNode.data.method}
                      </span>
                      <h4 className="font-black text-lg text-gray-900 leading-tight font-mono break-all">{detailNode.data.path}</h4>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{detailNode.data.desc}</p>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 text-xs">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-gray-150 flex flex-col gap-2.5">
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Quyền truy cập (Allowed Roles):</span>
                          <span className="font-semibold text-indigo-700">{detailNode.data.roles}</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Yêu cầu xác thực:</span>
                          <span className="font-bold text-green-600">Có (Require JWT in Headers/Cookies)</span>
                        </div>
                      </div>

                      {detailNode.data.method === 'POST' || detailNode.data.method === 'PATCH' ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <span className="text-gray-400 block text-[9px] uppercase font-bold">Tham số đầu vào (Request Body JSON):</span>
                          <pre className="bg-slate-900 text-slate-300 font-mono text-[9px] p-3.5 rounded-2xl border border-slate-800 overflow-x-auto text-left leading-relaxed">
                            {detailNode.data.path === '/login' ? (
                              `{\n  "username": "ktv01",\n  "password": "password123"\n}`
                            ) : detailNode.data.path === '/' && detailNode.data.roles.includes('COORDINATOR') ? (
                              `{\n  "customerName": "Lê Văn A",\n  "customerPhone": "0987654321",\n  "address": "123 Đường B",\n  "workType": "Lắp đặt",\n  "serviceType": "RO"\n}`
                            ) : (
                              `{\n  "adminStatus": "hoàn thành",\n  "assignedKtvId": "user-uuid-1234"\n}`
                            )}
                          </pre>
                        </div>
                      ) : null}
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
