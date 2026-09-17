import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ArrowRight, UploadCloud, CheckCircle, CheckCircle2, AlertTriangle, Smartphone, User, MapPin, Loader2, Sparkles, ChevronLeft, ChevronRight, PhoneCall, Wrench, Send, Search, ChevronDown, Sun, Moon, Monitor } from 'lucide-react';
import { API_URL } from '../../api/client';
import { isValidPhone, PHONE_ERROR_MSG } from '../../utils/phone';
import { HOTLINE_SERVICE_REQUEST_TYPES } from '../../utils/workTypes';
import { ProductVisualSelect, type ProductVisualItem } from '../../components/ProductVisualSelect';

const DEFAULT_SUPPORT_DEVICES: ProductVisualItem[] = [
  {
    name: 'Máy lọc nước Truliva UR61096H',
    category: 'Water UTS Device',
    sku: '104321-0002',
    imageUrl: 'https://content.pancake.vn/2-2604/2026/4/17/15147a0a3a011bb424fde9a88fdbdca7ef7df60e.png'
  },
  {
    name: 'Máy lọc nước Truliva UR5840',
    category: 'Water UTS Device',
    sku: '104201-0003',
    imageUrl: 'https://content.pancake.vn/2-2604/2026/4/17/12da1b6fe07886ae1e01f897cf3f18375fde6c31.png'
  },
  {
    name: 'Máy lọc nước Truliva UR5676',
    category: 'Water UTS Device',
    sku: '104222-0002',
    imageUrl: 'https://content.pancake.vn/2-2608/2026/8/14/f99da1a9790fb3c91658f5acd4338f31f3ad9736.png'
  },
  {
    name: 'Máy lọc nước Truliva UR3626',
    category: 'Water UTS Device',
    sku: '104338-0002',
    imageUrl: 'https://content.pancake.vn/2-2604/2026/4/17/39b464f0b25d284c24511736754af7f0f9339b0b.png'
  },
  {
    name: 'Máy lọc nước Truliva Lavita CR-ZX5170',
    category: 'Water CT Device',
    sku: '101175-0002',
    imageUrl: 'https://content.pancake.vn/2-2607/2026/7/23/f2755c464585f26f476a0e62259bb2038516a0c8.jpg'
  },
  {
    name: 'Máy nóng lạnh Truliva Lavita YDZ-5301D',
    category: 'Water CT Device',
    sku: '102172-0001',
    imageUrl: 'https://content.pancake.vn/2-2607/2026/7/23/11e26595dc23bc9b76a55a930c9b6de05c900202.jpg'
  },
  {
    name: 'Máy nóng lạnh treo tường Truliva W6412',
    category: 'Water WM Device',
    sku: '103057-001',
    imageUrl: 'https://content.pancake.vn/2-2604/2026/4/17/12395203216b3f5f40e9e820494a84df72826289.png'
  },
  {
    name: 'Máy lọc không khí Airplus KJ260',
    category: 'Air CT Device',
    sku: '194001-0144',
    imageUrl: 'https://content.pancake.vn/2-2603/2026/3/9/f96594a1e3dd08a58b3390bd37876600d47f363d.jpg'
  },
  {
    name: 'Máy rửa rau Truliva QY/F-I20',
    category: 'Device',
    sku: '133013-0001',
    imageUrl: 'https://content.pancake.vn/2-2607/2026/7/1/f4a302dfebe14b2447b0bf91d7d9443e75a4138e.jpg'
  },
  {
    name: 'Máy lọc nước Delica UR5440',
    category: 'Water UTS Device',
    sku: '68720542',
    imageUrl: 'https://cdn11.dienmaycholon.vn/filewebdmclnew/DMCL21/Picture/Apro/Apro_product_31119/may-loc-nuoc-pureit-delica-ur5440-main-31119.png'
  },
  {
    name: 'Máy lọc nước Delica UR5640',
    category: 'Water UTS Device',
    sku: '68342070',
    imageUrl: 'https://cdn11.dienmaycholon.vn/filewebdmclnew/DMCL21/Picture/Apro/Apro_product_31112/may-loc-nuoc-pureit-delica-ur5640-main-322306.png'
  },
  {
    name: 'Máy lọc nước Delica UR5840',
    category: 'Water UTS Device',
    sku: '69568170',
    imageUrl: 'https://unileverpureit.vn/wp-content/uploads/2022/06/May-loc-nuoc-Pureit-am-tu-bep-Delica-UR5840.png'
  },
  {
    name: 'Máy lọc nước Lavita CR5240',
    category: 'Water CT Device',
    sku: '68464824',
    imageUrl: 'https://unileverpureit.vn/wp-content/uploads/2022/05/May-Loc-Nuoc-Nong-Thong-Minh-Lavita.png'
  },
  {
    name: 'Máy lọc nước Tanka UR3140',
    category: 'Water UTS Device',
    sku: '68720541',
    imageUrl: 'https://cdn.nguyenkimmall.com/images/detailed/755/10050105-may-loc-nuoc-pureit-tanka-ur3140-1.jpg'
  },
  {
    name: 'Máy lọc nước Classic',
    category: 'Device',
    sku: '68457573',
    imageUrl: 'https://cdn11.dienmaycholon.vn/filewebdmclnew/DMCL21/Picture/Apro/Apro_product_30948/may-loc-nuoc-un_main_322_450.png.webp'
  },
  {
    name: 'Máy lọc nước Ultima Black',
    category: 'Device',
    sku: '67370949',
    imageUrl: 'https://pureitvietnam.com/wp-content/uploads/2023/06/May-loc-nuoc-Pureit-Ultima-10-copy.jpg'
  },
  {
    name: 'Máy lọc không khí Xiaomi Smart Air Purifier 4 Compact',
    category: 'Air CT Device',
    sku: '14131212',
    imageUrl: 'https://i02.appmifile.com/mi-com-product/fly-birds/m/xiaomi-smart-air-purifier-4-compact/3d38a4f14d88ba3c0d860fccc54981f7.jpg'
  },
  {
    name: 'Bộ lọc sơ cấp Truliva P1011',
    category: 'Prefilter',
    sku: '112053-0001',
    imageUrl: 'https://content.pancake.vn/2-2604/2026/4/17/15147a0a3a011bb424fde9a88fdbdca7ef7df60e.png'
  }
];

// Helper đối chiếu Tên Model / Dòng máy để lấy Ảnh và Tên đầy đủ
export const getProductVisualByModelOrName = (
  model?: string | null,
  productLine?: string | null
): { name: string; imageUrl: string | null } => {
  if (!model && !productLine) return { name: '', imageUrl: null };
  const target = `${productLine || ''} ${model || ''}`.toLowerCase();

  // 1. Tìm chính xác hoặc tương đối trong danh mục thiết bị chuẩn
  for (const item of DEFAULT_SUPPORT_DEVICES) {
    const itemName = item.name.toLowerCase();
    if (model && itemName.includes(model.toLowerCase())) {
      return { name: item.name, imageUrl: item.imageUrl || null };
    }
    if (target.includes(itemName) || itemName.includes(target)) {
      return { name: item.name, imageUrl: item.imageUrl || null };
    }
  }

  // 2. Tìm theo mã model đặc thù
  if (target.includes('5840')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR5840'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('5440')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR5440'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('5640')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR5640'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('3140') || target.includes('tanka')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR3140') || d.name.includes('Tanka'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('5240') || target.includes('lavita')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('CR5240') || d.name.includes('Lavita'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('ux5010') || target.includes('ultima') || target.includes('5010')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('Ultima'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('61096')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR61096H'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('3626')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR3626'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('5676')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('UR5676'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('p1011') || target.includes('1011')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('P1011'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('w6412') || target.includes('6412')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('W6412'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('i20') || target.includes('rửa rau') || target.includes('qy/f-i20')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('QY/F-I20'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('kj260') || target.includes('260')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('KJ260'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }
  if (target.includes('classic')) {
    const found = DEFAULT_SUPPORT_DEVICES.find(d => d.name.includes('Classic'));
    if (found) return { name: found.name, imageUrl: found.imageUrl || null };
  }

  return {
    name: productLine || (model ? `Máy lọc nước ${model}` : ''),
    imageUrl: null
  };
};

// Định dạng hiển thị Số Serial dạng: XXXX XXX XXX XXXXX
const formatSerialNumber = (value: string): string => {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
  let formatted = '';
  if (clean.length > 0) {
    formatted += clean.substring(0, 4);
  }
  if (clean.length > 4) {
    formatted += ' ' + clean.substring(4, 7);
  }
  if (clean.length > 7) {
    formatted += ' ' + clean.substring(7, 10);
  }
  if (clean.length > 10) {
    formatted += ' ' + clean.substring(10, 15);
  }
  return formatted.trim();
};

const VIETNAM_PROVINCES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu', 'Bắc Ninh',
  'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước', 'Bình Thuận', 'Cà Mau',
  'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắc Lắk', 'Đắc Nông', 'Điện Biên', 'Đồng Nai',
  'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 'Hà Tĩnh', 'Hải Dương',
  'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang',
  'Kon Tum', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định',
  'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình',
  'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng', 'Sơn La',
  'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang',
  'TP Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
];

const PRIORITY_PROVINCES = ['TP Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng'];
const OTHER_PROVINCES = VIETNAM_PROVINCES.filter(p => !PRIORITY_PROVINCES.includes(p));
const ORDERED_VIETNAM_PROVINCES = [...PRIORITY_PROVINCES, ...OTHER_PROVINCES];

interface ProductInfo {
  serialNumber: string;
  model: string;
  productLine?: string;
  displayName?: string;
  imageUrl?: string | null;
  standardMonths: number;
  totalMonths: number;
  status: string;
  warrantyExpiryDate?: string | null;
}

function GenericSearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  allowCustomOther = false,
  otherLabel = '+ Sản phẩm khác',
  onSelectOther
}: {
  items: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  allowCustomOther?: boolean;
  otherLabel?: string;
  onSelectOther?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = items.filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white flex items-center justify-between text-left font-medium shadow-xs"
      >
        <span className={value ? 'text-gray-800 font-semibold truncate' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-left animate-fade-in flex flex-col max-h-72">
          {/* Search Bar */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/90 sticky top-0 z-10 flex items-center gap-2">
            <Search size={16} className="text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-xs outline-none bg-transparent py-1 font-medium placeholder:text-gray-400 text-gray-800"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600 text-xs px-1 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* List items */}
          <div className="overflow-y-auto max-h-56 p-1.5 space-y-0.5 custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    onChange(item);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-xl transition flex items-center justify-between font-medium ${
                    value === item
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span>{item}</span>
                  {value === item && <CheckCircle size={14} className="text-blue-600 shrink-0 ml-2" />}
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-gray-400">
                Không tìm thấy kết quả "{searchTerm}"
              </div>
            )}

            {allowCustomOther && (
              <button
                type="button"
                onClick={() => {
                  onChange('Sản phẩm khác');
                  if (onSelectOther) onSelectOther();
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition font-bold border-t border-gray-100 mt-1 ${
                  value === 'Sản phẩm khác'
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-amber-50 text-amber-700'
                }`}
              >
                {otherLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SerialValidation {
  status: 'IDLE' | 'CHECKING' | 'VALID' | 'ACTIVATED' | 'NOT_FOUND' | 'ERROR';
  model?: string;
  productLine?: string;
  displayName?: string;
  imageUrl?: string | null;
  totalMonths?: number;
  expiryDate?: string;
  message?: string;
}

export default function WarrantyActivate() {
  const [searchParams] = useSearchParams();
  const serialFromUrl = searchParams.get('serial') || '';

  // Step tracking: 0 = Landing, 1 = Enter Details & Invoice, 2 = Check/Confirm Details, 3 = Success
  const [step, setStep] = useState(serialFromUrl ? 1 : 0);

  // Form states
  const [serialInput, setSerialInput] = useState(formatSerialNumber(serialFromUrl));
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [invoiceImageUrl, setInvoiceImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Status & Fetching States
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [serialValidation, setSerialValidation] = useState<SerialValidation>({ status: 'IDLE' });
  
  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Theme Management: Auto-detect browser/OS preference or manual user toggle ('auto' | 'light' | 'dark')
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>('auto');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('truliva_warranty_theme') as 'auto' | 'light' | 'dark' | null;
    const initialMode = saved || 'auto';
    setThemeMode(initialMode);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateTheme = (mode: 'auto' | 'light' | 'dark') => {
      if (mode === 'auto') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setResolvedTheme(mode);
      }
    };

    updateTheme(initialMode);

    const handleMediaChange = (e: MediaQueryListEvent) => {
      const currentSaved = localStorage.getItem('truliva_warranty_theme') as 'auto' | 'light' | 'dark' | null;
      if (!currentSaved || currentSaved === 'auto') {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const handleSetTheme = (mode: 'auto' | 'light' | 'dark') => {
    setThemeMode(mode);
    localStorage.setItem('truliva_warranty_theme', mode);
    if (mode === 'auto') {
      const isDarkPref = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDarkPref ? 'dark' : 'light');
    } else {
      setResolvedTheme(mode);
    }
  };

  const isDark = resolvedTheme === 'dark';

  // Theme Switcher Widget Component (Modern Segmented Pill)
  const renderThemeSwitcher = () => (
    <div className={`inline-flex items-center p-0.5 rounded-full border transition-all ${
      isDark 
        ? 'bg-[#0D2444]/90 border-cyan-400/25 shadow-[0_0_12px_rgba(0,210,255,0.15)]' 
        : 'bg-white/95 border-blue-200 shadow-sm'
    }`}>
      <button
        type="button"
        onClick={() => handleSetTheme('light')}
        title="Giao diện Sáng (Light Mode)"
        className={`p-1.5 rounded-full transition-all flex items-center justify-center cursor-pointer ${
          themeMode === 'light'
            ? 'bg-amber-400 text-slate-950 shadow-sm'
            : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-amber-600'
        }`}
      >
        <Sun size={13} className="stroke-[2.5]" />
      </button>

      <button
        type="button"
        onClick={() => handleSetTheme('auto')}
        title="Tự động theo Trình duyệt / Thiết bị (Auto OS)"
        className={`p-1.5 rounded-full transition-all flex items-center justify-center cursor-pointer ${
          themeMode === 'auto'
            ? isDark
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'bg-[#1B3A6B] text-white shadow-sm'
            : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-[#1B3A6B]'
        }`}
      >
        <Monitor size={13} className="stroke-[2.5]" />
      </button>

      <button
        type="button"
        onClick={() => handleSetTheme('dark')}
        title="Giao diện Tối (Dark Mode)"
        className={`p-1.5 rounded-full transition-all flex items-center justify-center cursor-pointer ${
          themeMode === 'dark'
            ? 'bg-blue-600 text-white shadow-sm'
            : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-blue-600'
        }`}
      >
        <Moon size={13} className="stroke-[2.5]" />
      </button>
    </div>
  );

  // Tech Support Form states (step 10 & 11)
  const [supportName, setSupportName] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportSecondaryPhones, setSupportSecondaryPhones] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportProvince, setSupportProvince] = useState('');
  const [supportAddress, setSupportAddress] = useState('');
  const [supportProduct, setSupportProduct] = useState('');
  const [customSupportProduct, setCustomSupportProduct] = useState('');
  const [deviceTreeData, setDeviceTreeData] = useState<{ categories: string[]; products: any[] }>({
    categories: [],
    products: []
  });
  const [supportSerial, setSupportSerial] = useState('');
  const [supportServiceType, setSupportServiceType] = useState('Bảo Hành - Bảo Trì');
  const [supportDetail, setSupportDetail] = useState('');
  const [supportError, setSupportError] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportSuccessTicket, setSupportSuccessTicket] = useState('');

  // Fetch public device categories/models when entering Tech Support Form
  useEffect(() => {
    if (step === 10 && deviceTreeData.categories.length === 0) {
      fetch(`${API_URL}/hotlines/public/devices`)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.categories) && Array.isArray(data.products)) {
            setDeviceTreeData(data);
          }
        })
        .catch(console.error);
    }
  }, [step, deviceTreeData.categories.length]);

  const visualSupportProducts: ProductVisualItem[] = useMemo(() => {
    if (deviceTreeData.products.length > 0) {
      return deviceTreeData.products
        .filter((p: any) => {
          const nameStr = typeof p === 'string' ? p : p.name;
          const lower = (nameStr || '').toLowerCase();
          return !lower.includes('lõi') && !lower.includes('loi') && !lower.includes('linh kiện') && !lower.includes('phụ kiện') && !lower.includes('bộ dụng cụ') && !lower.includes('chảo') && !lower.includes('cảm biến') && !lower.includes('bộ lọc') && !lower.includes('bo loc');
        })
        .map((p: any) => ({
          name: typeof p === 'string' ? p : p.name,
          category: typeof p === 'object' ? p.category : 'Thiết bị',
          sku: typeof p === 'object' ? p.sku : '',
          imageUrl: typeof p === 'object' ? p.imageUrl : null
        }));
    }
    return DEFAULT_SUPPORT_DEVICES;
  }, [deviceTreeData.products]);

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
     const cleanPhone = supportPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      setSupportError('Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số liền kề nhau.');
      return;
    }

    if (supportSecondaryPhones.trim()) {
      const cleanSecPhone = supportSecondaryPhones.replace(/[^0-9]/g, '');
      if (cleanSecPhone.length !== 10) {
        setSupportError('Số điện thoại phụ không hợp lệ. Vui lòng nhập đúng 10 số liền kề nhau.');
        return;
      }
    }

    if (!supportProvince) { setSupportError('Vui lòng chọn Tỉnh / Thành phố'); return; }
    if (!supportAddress.trim()) { setSupportError('Vui lòng nhập địa chỉ cụ thể'); return; }
    if (!supportProduct) { setSupportError('Vui lòng chọn Sản phẩm'); return; }
    if ((supportProduct === 'Sản phẩm khác' || supportProduct === 'Thiết bị khác') && !customSupportProduct.trim()) { setSupportError('Vui lòng nhập tên sản phẩm cụ thể'); return; }
    if (!supportServiceType) { setSupportError('Vui lòng chọn yêu cầu dịch vụ'); return; }
    if (!supportDetail.trim()) { setSupportError('Vui lòng nhập nội dung cần hỗ trợ'); return; }

    setSubmittingSupport(true);
    setSupportError('');

    const finalProduct = (supportProduct === 'Sản phẩm khác' || supportProduct === 'Thiết bị khác')
      ? (customSupportProduct.trim() || 'Sản phẩm khác')
      : supportProduct;

    try {
      const response = await fetch(`${API_URL}/hotlines/public/create-support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: supportName.trim(),
          customerPhone: supportPhone.trim(),
          secondaryPhones: supportSecondaryPhones.trim(),
          email: supportEmail.trim(),
          provinceName: supportProvince,
          address: supportAddress.trim(),
          productName: finalProduct,
          serialNumber: supportSerial.trim(),
          serviceRequestType: supportServiceType,
          customerSupportDetail: supportDetail.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi gửi yêu cầu hỗ trợ kỹ thuật');
      }

      setSupportSuccessTicket(data.ticketCode || 'HL-WEBAPP');
      setStep(11);
    } catch (err: any) {
      console.error(err);
      setSupportError(err.message || 'Có lỗi xảy ra khi gửi yêu cầu. Vui lòng liên hệ Hotline 1900 63 84 63');
    } finally {
      setSubmittingSupport(false);
    }
  };

  // Auto-fill serial if provided in URL
  useEffect(() => {
    if (serialFromUrl) {
      setSerialInput(formatSerialNumber(serialFromUrl));
      setStep(1);
    }
  }, [serialFromUrl]);

  // Validate serial when input reaches 15 chars (without prefilling any personal data)
  useEffect(() => {
    const cleanSerial = serialInput.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanSerial.length !== 15) {
      setSerialValidation({ status: 'IDLE' });
      setProductInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSerialValidation({ status: 'CHECKING' });
      setSubmitError('');
      try {
        const response = await fetch(`${API_URL}/serials/public/check/${encodeURIComponent(cleanSerial)}`);
        const data = await response.json();

        if (!response.ok) {
          setSerialValidation({
            status: 'NOT_FOUND',
            message: data.error || 'Số Serial không tồn tại trong hệ thống.'
          });
          setProductInfo(null);
          return;
        }

        const visual = getProductVisualByModelOrName(data.model, data.productLine);
        const resolvedImageUrl = data.imageUrl || visual.imageUrl || null;
        const resolvedDisplayName = visual.name || data.productLine || data.model;

        if (data.isActivated || data.status === 'Đã kích hoạt' || data.status === 'KH xác nhận') {
          let expiryText = '';
          if (data.warrantyExpiryDate) {
            const d = new Date(data.warrantyExpiryDate);
            expiryText = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          }
          setSerialValidation({
            status: 'ACTIVATED',
            model: data.model,
            productLine: data.productLine,
            displayName: resolvedDisplayName,
            imageUrl: resolvedImageUrl,
            expiryDate: expiryText,
            message: 'Số Serial này đã được kích hoạt bảo hành trước đó.'
          });
          setProductInfo(null);
          return;
        }

        // Serial is valid & unactivated
        const totalMonths = data.totalMonths || data.standardMonths || 12;
        setSerialValidation({
          status: 'VALID',
          model: data.model,
          productLine: data.productLine,
          displayName: resolvedDisplayName,
          imageUrl: resolvedImageUrl,
          totalMonths,
          message: 'Số Serial hợp lệ'
        });
        setProductInfo({
          serialNumber: data.serialNumber,
          model: data.model,
          productLine: data.productLine,
          displayName: resolvedDisplayName,
          imageUrl: resolvedImageUrl,
          standardMonths: data.standardMonths,
          totalMonths,
          status: data.status,
          warrantyExpiryDate: data.warrantyExpiryDate
        });
      } catch (err: any) {
        setSerialValidation({
          status: 'ERROR',
          message: 'Không thể kết nối máy chủ để kiểm tra số Serial. Vui lòng thử lại sau.'
        });
        setProductInfo(null);
      }
    }, 400); // Debounce 400ms

    return () => clearTimeout(timer);
  }, [serialInput]);

  const handleUploadInvoice = async (file: File) => {
    setUploadingImage(true);
    setSubmitError('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(`${API_URL}/serials/public/upload-invoice`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi upload ảnh hóa đơn');
      }

      setInvoiceImageUrl(data.url);
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'Không thể tải ảnh lên. Vui lòng chọn ảnh khác.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCheckAndProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSerial = serialInput.replace(/[^a-zA-Z0-9]/g, '');

    if (!cleanSerial || cleanSerial.length !== 15) {
      setSubmitError('Số Serial bắt buộc phải gồm đúng 15 ký tự chữ và số.');
      return;
    }
    if (serialValidation.status === 'ACTIVATED') {
      setSubmitError('Số Serial này đã được kích hoạt bảo hành trước đó. Vui lòng liên hệ Hotline 1900 63 84 63 để được hỗ trợ.');
      return;
    }
    if (serialValidation.status !== 'VALID' || !productInfo) {
      setSubmitError('Vui lòng nhập số Serial hợp lệ trước khi tiếp tục.');
      return;
    }
    if (!customerName.trim()) {
      setSubmitError('Vui lòng điền họ và tên người sử dụng');
      return;
    }
    if (!isValidPhone(customerPhone)) {
      setSubmitError(PHONE_ERROR_MSG);
      return;
    }
    if (!province) {
      setSubmitError('Vui lòng chọn Tỉnh/Thành phố');
      return;
    }
    if (!address.trim()) {
      setSubmitError('Vui lòng điền địa chỉ lắp đặt cụ thể');
      return;
    }
    if (!invoiceImageUrl) {
      setSubmitError('Vui lòng chụp/tải lên ảnh hóa đơn mua hàng');
      return;
    }

    setSubmitError('');
    setStep(2);
  };

  const handleSubmitActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productInfo) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(`${API_URL}/serials/public/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serialNumber: productInfo.serialNumber,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          address: address.trim(),
          province: province,
          invoiceImageUrl
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi gửi yêu cầu kích hoạt bảo hành');
      }

      setSuccessMessage(data.message);
      if (data.serial) {
        setProductInfo({
          serialNumber: data.serial.serialNumber,
          model: data.serial.model,
          standardMonths: productInfo.standardMonths,
          totalMonths: productInfo.totalMonths,
          status: 'Đã kích hoạt',
          warrantyExpiryDate: data.serial.warrantyExpiryDate
        });
      }
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'Lỗi gửi yêu cầu kích hoạt. Vui lòng liên hệ hotline hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== STEP 0: LANDING PAGE ====================
  if (step === 0) {
    return (
      <div className={`min-h-screen flex flex-col font-sans antialiased relative overflow-hidden transition-colors duration-300 ${
        isDark
          ? 'bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#061226] text-white'
          : 'bg-gradient-to-b from-[#EBF3FC] via-[#F4F8FD] to-[#E5EFFB] text-slate-800'
      }`}>
        
        {/* Ambient background glowing orbs */}
        {isDark ? (
          <>
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-2/3 right-10 w-72 h-72 bg-blue-600/10 rounded-full blur-2xl pointer-events-none"></div>
          </>
        ) : (
          <>
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-sky-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-2/3 right-10 w-72 h-72 bg-blue-400/15 rounded-full blur-2xl pointer-events-none"></div>
          </>
        )}

        {/* Header Bar */}
        <header className={`flex items-center justify-between px-5 py-3.5 sm:py-4 backdrop-blur-md border-b relative z-20 transition-colors duration-300 ${
          isDark 
            ? 'bg-[#061226]/90 border-white/10' 
            : 'bg-white/85 border-blue-100/80 shadow-xs'
        }`}>
          <div className="flex items-center space-x-2">
            <img 
              src="/logo.png?v=3" 
              alt="Truliva" 
              className="h-10 object-contain"
              style={{ filter: isDark ? 'drop-shadow(1px 0 0 #ffffff) drop-shadow(-1px 0 0 #ffffff) drop-shadow(0 1px 0 #ffffff) drop-shadow(0 -1px 0 #ffffff)' : 'none' }}
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {renderThemeSwitcher()}
            <a 
              href="tel:1900638463" 
              className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shadow-xs ${
                isDark 
                  ? 'bg-[#0F2F59] hover:bg-[#153E75] text-white border-cyan-400/30 shadow-[0_0_12px_rgba(0,210,255,0.2)]'
                  : 'bg-blue-50 hover:bg-blue-100 text-[#1B3A6B] border-blue-200 shadow-sm'
              }`}
            >
              <PhoneCall size={14} className={isDark ? "text-[#00D2FF]" : "text-[#00A3FF]"} />
              <span className="font-mono tracking-tight">1900 63 84 63</span>
            </a>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center px-4 py-8 sm:py-12 max-w-md mx-auto w-full relative z-10">
          <div className={`backdrop-blur-2xl rounded-3xl p-5 sm:p-7 border space-y-6 transition-all duration-300 ${
            isDark
              ? 'bg-white/[0.05] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-white/10'
              : 'bg-white/90 shadow-[0_20px_50px_rgba(27,58,107,0.12)] border-white/80'
          }`}>

            {/* Greeting + 3D Crystal Water Drop */}
            <div className="flex items-center justify-between pt-1 pb-1">
              <div>
                <h1 className={`text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2 ${
                  isDark ? 'text-white' : 'text-[#1B3A6B]'
                }`}>
                  <span>Xin chào!</span>
                </h1>
                <p className={`text-xs font-medium mt-1 leading-snug ${
                  isDark ? 'text-sky-200/80' : 'text-slate-500'
                }`}>
                  Chúng tôi luôn sẵn sàng đồng hành<br className="hidden sm:inline" /> cùng bạn.
                </p>
              </div>
              
              {/* 3D Photorealistic Crystal Water Droplet */}
              <div className="relative w-18 h-18 shrink-0 flex items-center justify-center">
                {/* Glowing liquid caustics ripple rings */}
                <div className={`absolute -bottom-1 w-16 h-4 rounded-full blur-md animate-pulse ${
                  isDark ? 'bg-cyan-400/25' : 'bg-sky-400/30'
                }`}></div>
                <div className={`absolute bottom-0 w-12 h-3 rounded-full blur-sm ${
                  isDark ? 'bg-sky-300/40' : 'bg-sky-300/50'
                }`}></div>
                
                {/* Crystal 3D Water Droplet */}
                <svg viewBox="0 0 100 120" className={`w-16 h-20 filter ${
                  isDark ? 'drop-shadow-[0_10px_20px_rgba(0,210,255,0.45)]' : 'drop-shadow-[0_10px_20px_rgba(0,163,255,0.35)]'
                }`}>
                  <defs>
                    {/* Outer body deep liquid gradient */}
                    <linearGradient id="dropMainGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#E6F9FF" stopOpacity="0.95" />
                      <stop offset="25%" stopColor="#7EE2FF" stopOpacity="0.9" />
                      <stop offset="60%" stopColor="#00A3FF" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#0055B3" stopOpacity="0.95" />
                    </linearGradient>

                    {/* Internal caustic refraction */}
                    <radialGradient id="causticRefraction" cx="60%" cy="75%" r="50%">
                      <stop offset="0%" stopColor="#00FFFF" stopOpacity="0.85" />
                      <stop offset="50%" stopColor="#00A3FF" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#003366" stopOpacity="0" />
                    </radialGradient>

                    {/* Primary specular light curved glint */}
                    <linearGradient id="specularGlint" x1="20%" y1="0%" x2="80%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                      <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </linearGradient>

                    {/* Secondary bottom bounce reflection */}
                    <radialGradient id="bottomBounceGlow" cx="50%" cy="90%" r="40%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
                      <stop offset="100%" stopColor="#00A3FF" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Droplet Base Body */}
                  <path
                    d="M50 8 C50 8, 12 62, 12 84 A38 38 0 0 0 88 84 C88 62, 50 8, 50 8 Z"
                    fill="url(#dropMainGlow)"
                  />

                  {/* Internal refractive caustic pool */}
                  <ellipse cx="50" cy="82" rx="28" ry="24" fill="url(#causticRefraction)" />

                  {/* Left Specular Glint (Top Curve) */}
                  <path
                    d="M48 16 C48 16, 22 58, 22 76 C22 84, 26 90, 26 90 C24 84, 28 58, 48 24 Z"
                    fill="url(#specularGlint)"
                  />

                  {/* Secondary High Light Orb */}
                  <circle cx="36" cy="42" r="5" fill="#FFFFFF" fillOpacity="0.85" />
                  <circle cx="42" cy="50" r="2.5" fill="#FFFFFF" fillOpacity="0.6" />

                  {/* Bottom Water Rim Light Bounce */}
                  <ellipse cx="52" cy="98" rx="22" ry="7" fill="url(#bottomBounceGlow)" />
                </svg>
              </div>
            </div>

            {/* 3 Main Action Cards */}
            <div className="space-y-3.5 pt-1">
              {/* 1. Kích hoạt bảo hành sản phẩm (Nút Đỏ) */}
              <button
                onClick={() => setStep(1)}
                className="w-full bg-gradient-to-r from-[#E53935] to-[#D32F2F] hover:brightness-110 active:scale-[0.98] rounded-2xl p-4 border border-red-400/30 shadow-lg shadow-red-950/40 hover:shadow-red-500/20 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                    <ShieldCheck size={26} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[15px] text-white leading-tight">Kích hoạt</h3>
                    <p className="text-xs text-white/85 font-medium mt-0.5">Bảo hành sản phẩm</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-white/80 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </button>

              {/* 2. Hỗ trợ kỹ thuật (Nút Xanh Lá) */}
              <button
                onClick={() => setStep(10)}
                className="w-full bg-gradient-to-r from-[#2E7D32] to-[#1B5E20] hover:brightness-110 active:scale-[0.98] rounded-2xl p-4 border border-green-400/30 shadow-lg shadow-green-950/40 hover:shadow-green-500/20 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                    <Wrench size={26} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[15px] text-white leading-tight">Hỗ trợ kỹ thuật</h3>
                    <p className="text-xs text-white/85 font-medium mt-0.5">Hướng dẫn & hỗ trợ</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-white/80 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </button>

              {/* 3. Zalo CSKH (Nút Xanh Dương) */}
              <a
                href="https://zalo.me/3870382725035413507"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-[#0068FF] to-[#0052CC] hover:brightness-110 active:scale-[0.98] rounded-2xl p-4 border border-blue-400/30 shadow-lg shadow-blue-950/40 hover:shadow-blue-500/20 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 fill-current text-white" viewBox="0 0 24 24">
                      <path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[15px] text-white leading-tight">Zalo CSKH</h3>
                    <p className="text-xs text-white/85 font-medium mt-0.5">Trợ lý trực tiếp trên Zalo OA</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-white/80 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </a>
            </div>

            {/* Brand Heritage & Net Zero Carbon Section */}
            <div className={`mt-6 rounded-2xl border p-4 relative overflow-hidden backdrop-blur-md transition-all duration-300 space-y-3 ${
              isDark
                ? 'bg-gradient-to-b from-white/[0.08] to-white/[0.02] border-cyan-400/20 shadow-inner'
                : 'bg-gradient-to-b from-blue-50/90 to-sky-50/50 border-blue-200/70 shadow-xs'
            }`}>
              {/* Background ambient glow inside badge */}
              <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-cyan-500/10' : 'bg-sky-400/20'}`}></div>
              <div className={`absolute bottom-0 left-0 w-20 h-20 rounded-full blur-xl pointer-events-none ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-400/15'}`}></div>

              {/* Item 1: Unilever Heritage */}
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                  isDark
                    ? 'bg-blue-500/20 border-blue-400/30 text-[#00D2FF] shadow-[0_0_10px_rgba(0,210,255,0.25)]'
                    : 'bg-blue-100 border-blue-300/60 text-[#0068FF]'
                }`}>
                  <Sparkles size={16} />
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  <strong className={`font-black tracking-wide ${isDark ? 'text-white' : 'text-[#1B3A6B]'}`}>TRULIVA</strong> – thương hiệu máy lọc nước thuộc sở hữu của <span className={`font-bold ${isDark ? 'text-[#00D2FF]' : 'text-[#0068FF]'}`}>Unilever (2014–2024)</span>
                </p>
              </div>

              {/* Divider */}
              <div className={`h-px ${isDark ? 'bg-gradient-to-r from-transparent via-white/15 to-transparent' : 'bg-gradient-to-r from-transparent via-blue-200 to-transparent'}`}></div>

              {/* Item 2: Net Zero Carbon Certification */}
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                  isDark
                    ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300 shadow-[0_0_10px_rgba(34,197,94,0.25)]'
                    : 'bg-emerald-100 border-emerald-300/60 text-emerald-700'
                }`}>
                  <CheckCircle2 size={16} />
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  Sản phẩm <strong className={`font-black tracking-wide ${isDark ? 'text-white' : 'text-[#1B3A6B]'}`}>TRULIVA</strong> được sản xuất tại nhà máy đạt chứng nhận <span className={`font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Net Zero Carbon – Không Carbon chuẩn 6 sao</span>, hướng đến công nghệ xanh và bảo vệ môi trường.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <footer className={`text-center px-5 py-6 space-y-3 border-t relative z-20 transition-colors duration-300 ${
          isDark ? 'bg-[#061226] border-white/10 text-slate-400' : 'bg-white/90 border-blue-100 text-slate-500'
        }`}>
          <div className="flex items-center justify-center gap-2.5 text-[10px] font-bold tracking-wider flex-wrap">
            <a href="#" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-[#1B3A6B]'}`}>SITEMAP</a>
            <span>|</span>
            <a href="#" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-[#1B3A6B]'}`}>COOKIE POLICY</a>
            <span>|</span>
            <a href="#" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-[#1B3A6B]'}`}>T&C</a>
            <span>|</span>
            <a href="#" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-[#1B3A6B]'}`}>PRIVACY POLICY</a>
          </div>
          <p className="text-[11px] font-medium">© 2026 Truliva Vietnam. Tất cả quyền được bảo lưu.</p>
          
          {/* Social Icons */}
          <div className="flex items-center justify-center gap-3 pt-1">
            <a href="https://www.facebook.com/Truliva" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
              isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-blue-50 hover:bg-blue-100 text-[#1B3A6B]'
            }`}>
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href="https://www.youtube.com/@TrulivaVietnam" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
              isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-blue-50 hover:bg-blue-100 text-[#1B3A6B]'
            }`}>
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
            <a href="https://zalo.me/3870382725035413507" target="_blank" rel="noopener noreferrer" aria-label="Zalo" className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
              isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-blue-50 hover:bg-blue-100 text-[#1B3A6B]'
            }`}>
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2z"/></svg>
            </a>
          </div>
        </footer>

      </div>
    );
  }

  // ==================== STEP 10: PUBLIC TECH SUPPORT FORM ====================
  if (step === 10) {
    return (
      <div className={`min-h-screen flex flex-col font-sans antialiased transition-colors duration-300 ${
        isDark
          ? 'bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#061226] text-white'
          : 'bg-gradient-to-b from-[#EBF3FC] via-[#F4F8FD] to-[#E5EFFB] text-slate-800'
      }`}>
        <header className={`flex items-center justify-between px-6 py-4 sm:py-5 border-b backdrop-blur-md transition-colors duration-300 ${
          isDark ? 'border-white/10 bg-[#061226]/90' : 'border-blue-100 bg-white/85 shadow-xs'
        }`}>
          <button onClick={() => setStep(0)} className={`flex items-center gap-1.5 text-sm font-semibold transition cursor-pointer ${
            isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-[#1B3A6B]'
          }`}>
            <ChevronLeft size={20} />
            <span>Trang chủ</span>
          </button>
          <div className="flex items-center gap-3">
            {renderThemeSwitcher()}
            <img 
              src="/logo.png?v=3" 
              alt="Truliva" 
              style={{ height: '40px', objectFit: 'contain', filter: isDark ? 'drop-shadow(1px 0 0 #ffffff) drop-shadow(-1px 0 0 #ffffff) drop-shadow(0 1px 0 #ffffff) drop-shadow(0 -1px 0 #ffffff)' : 'none' }}
            />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4 py-8">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
            isDark
              ? 'bg-[#0B1E38]/95 backdrop-blur-xl border border-cyan-500/20 text-white'
              : 'bg-white border border-blue-100 text-slate-800'
          }`}>
            <div className="bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] p-6 text-white text-center">
              <div className="inline-flex p-3 bg-white/10 rounded-xl mb-2">
                <Wrench size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-extrabold">Yêu Cầu Hỗ Trợ Kỹ Thuật</h2>
              <p className="text-xs text-blue-100 mt-1">Gửi thông tin sự cố, bộ phận Hotline / Kỹ thuật sẽ liên hệ hỗ trợ bạn ngay</p>
            </div>

            <form onSubmit={handleSubmitSupport} className="p-6 space-y-4 text-left">
              {supportError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{supportError}</span>
                </div>
              )}

              {/* Họ tên + SĐT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Họ và tên *</label>
                  <input
                    type="text"
                    placeholder="VD: Nguyễn Văn An"
                    value={supportName}
                    onChange={e => setSupportName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Số điện thoại *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="VD: 0912345678"
                    value={supportPhone}
                    onChange={e => setSupportPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono font-semibold ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* SĐT phụ + Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Số điện thoại phụ</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="VD: 0914567123"
                    value={supportSecondaryPhones}
                    onChange={e => setSupportSecondaryPhones(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Email</label>
                  <input
                    type="email"
                    placeholder="Email của bạn"
                    value={supportEmail}
                    onChange={e => setSupportEmail(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              {/* Tỉnh/thành phố + Địa chỉ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Tỉnh / Thành phố *</label>
                  <GenericSearchableSelect
                    items={ORDERED_VIETNAM_PROVINCES}
                    value={supportProvince}
                    onChange={setSupportProvince}
                    placeholder="-- Chọn Tỉnh / Thành phố --"
                    searchPlaceholder="Tìm tỉnh / thành phố (VD: TP.HCM, Hà Nội, Đà Nẵng...)"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Địa chỉ cụ thể *</label>
                  <input
                    type="text"
                    placeholder="VD: 123 Nguyễn Văn Cừ, Phường 4"
                    value={supportAddress}
                    onChange={e => setSupportAddress(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Sản phẩm (Full width) */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Sản phẩm *</label>
                <ProductVisualSelect
                  products={visualSupportProducts}
                  value={supportProduct}
                  onChange={(val) => {
                    setSupportProduct(val);
                    if (val !== 'Sản phẩm khác' && val !== 'Thiết bị khác') {
                      setCustomSupportProduct('');
                    }
                  }}
                  customValue={customSupportProduct}
                  onCustomChange={setCustomSupportProduct}
                  isDark={isDark}
                />
              </div>

              {/* Serial + Yêu cầu dịch vụ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Số Serial (nếu có)</label>
                  <input
                    type="text"
                    placeholder="VD: 185826042700121"
                    value={supportSerial}
                    onChange={e => setSupportSerial(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 font-mono ${
                      isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Yêu cầu dịch vụ *</label>
                  <select
                    value={supportServiceType}
                    onChange={e => setSupportServiceType(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                      isDark ? 'bg-[#152B4D] border-white/20 text-white' : 'bg-white border-gray-300 text-slate-800'
                    }`}
                    required
                  >
                    <option value="">-- Chọn yêu cầu dịch vụ --</option>
                    {HOTLINE_SERVICE_REQUEST_TYPES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nội dung cần hỗ trợ */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Nội dung chi tiết sự cố / Yêu cầu *</label>
                <textarea
                  rows={3}
                  placeholder="Vui lòng mô tả chi tiết hiện trạng máy hoặc sự cố đang gặp phải..."
                  value={supportDetail}
                  onChange={e => setSupportDetail(e.target.value)}
                  className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                    isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
                  }`}
                  required
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className={`flex-1 py-3 border rounded-xl font-bold text-sm transition cursor-pointer ${
                    isDark ? 'border-white/20 text-slate-300 hover:bg-white/10' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingSupport}
                  className="flex-[2] py-3 bg-[#2E7D32] hover:bg-[#1B5E20] text-white rounded-xl font-extrabold text-sm transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {submittingSupport ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  <span>Gửi Yêu Cầu Hỗ Trợ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STEP 11: TECH SUPPORT SUCCESS ====================
  if (step === 11) {
    return (
      <div className={`min-h-screen flex flex-col font-sans antialiased transition-colors duration-300 ${
        isDark
          ? 'bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#061226] text-white'
          : 'bg-gradient-to-b from-[#EBF3FC] via-[#F4F8FD] to-[#E5EFFB] text-slate-800'
      }`}>
        <header className={`flex items-center justify-between px-6 py-4 sm:py-5 border-b backdrop-blur-md transition-colors duration-300 ${
          isDark ? 'border-white/10 bg-[#061226]/90' : 'border-blue-100 bg-white/85 shadow-xs'
        }`}>
          <button onClick={() => setStep(0)} className={`flex items-center gap-1.5 text-sm font-semibold transition cursor-pointer ${
            isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-[#1B3A6B]'
          }`}>
            <ChevronLeft size={20} />
            <span>Trang chủ</span>
          </button>
          <div className="flex items-center gap-3">
            {renderThemeSwitcher()}
            <img 
              src="/logo.png?v=3" 
              alt="Truliva" 
              style={{ height: '40px', objectFit: 'contain', filter: isDark ? 'drop-shadow(1px 0 0 #ffffff) drop-shadow(-1px 0 0 #ffffff) drop-shadow(0 1px 0 #ffffff) drop-shadow(0 -1px 0 #ffffff)' : 'none' }}
            />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4 py-8">
          <div className={`rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-5 animate-fade-in border transition-all duration-300 ${
            isDark
              ? 'bg-[#0B1E38]/95 backdrop-blur-xl border-cyan-500/20 text-white'
              : 'bg-white border-blue-100 text-slate-800'
          }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-600'
            }`}>
              <CheckCircle size={36} />
            </div>

            <div className="space-y-2">
              <h2 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-gray-800'}`}>Yêu Cầu Hỗ Trợ Đã Gửi Thành Công!</h2>
              <div className={`inline-block px-3 py-1 font-mono font-bold text-sm rounded-lg border ${
                isDark ? 'bg-blue-500/20 border-cyan-400/30 text-cyan-300' : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                Mã Yêu Cầu: {supportSuccessTicket}
              </div>
              <p className={`text-xs leading-relaxed pt-2 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                Bộ phận Hotline và Kỹ thuật viên Truliva đã tiếp nhận thông tin sự cố của bạn. Chúng tôi sẽ chủ động liên hệ qua số điện thoại <b>{supportPhone}</b> trong thời gian sớm nhất.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setSupportName(''); setSupportPhone(''); setSupportSecondaryPhones('');
                  setSupportEmail(''); setSupportProvince(''); setSupportAddress('');
                  setSupportProduct(''); setSupportSerial(''); setSupportDetail('');
                  setStep(0);
                }}
                className="w-full py-3 bg-[#1B3A6B] hover:bg-[#122749] text-white rounded-xl font-bold text-sm transition shadow-md cursor-pointer"
              >
                Về Trang Chủ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STEP 1-3: FORM FLOW ====================
  return (
    <div className={`min-h-screen flex flex-col font-sans antialiased transition-colors duration-300 ${
      isDark
        ? 'bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#061226] text-white'
        : 'bg-gradient-to-b from-[#EBF3FC] via-[#F4F8FD] to-[#E5EFFB] text-slate-800'
    }`}>
      
      {/* Header Bar đồng bộ chuẩn UI */}
      <header className={`flex items-center justify-between px-6 py-4 sm:py-5 border-b backdrop-blur-md transition-colors duration-300 ${
        isDark ? 'border-white/10 bg-[#061226]/90' : 'border-blue-100 bg-white/85 shadow-xs'
      }`}>
        <button
          onClick={() => {
            if (step === 2) setStep(1);
            else setStep(0);
          }}
          className={`flex items-center gap-1.5 text-sm font-semibold transition cursor-pointer ${
            isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-[#1B3A6B]'
          }`}
        >
          <ChevronLeft size={20} />
          <span>{step === 2 ? 'Quay lại' : 'Trang chủ'}</span>
        </button>
        <div className="flex items-center gap-3">
          {renderThemeSwitcher()}
          <img 
            src="/logo.png?v=3" 
            alt="Truliva" 
            style={{ height: '40px', objectFit: 'contain', filter: isDark ? 'drop-shadow(1px 0 0 #ffffff) drop-shadow(-1px 0 0 #ffffff) drop-shadow(0 1px 0 #ffffff) drop-shadow(0 -1px 0 #ffffff)' : 'none' }}
          />
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 py-8">
        <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden p-6 relative z-10 border transition-all duration-300 ${
          isDark
            ? 'bg-[#0B1E38]/95 backdrop-blur-xl border-cyan-500/20 text-white'
            : 'bg-white border-blue-100 text-slate-800'
        }`}>
          
          {/* Banner Image */}
          <div className="w-full rounded-xl overflow-hidden mb-6 shadow-sm border border-blue-100">
            <img src="/banner.png" alt="Truliva Banner" className="w-full h-auto object-cover" />
          </div>

          {/* Branding Header */}
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md ${
              isDark ? 'bg-blue-500/20 border border-cyan-400/30' : 'bg-blue-50 border border-blue-200/50 shadow-blue-500/5'
            }`}>
              <ShieldCheck size={36} className={isDark ? "text-cyan-400" : "text-blue-600"} />
            </div>
            <h1 className={`text-xl font-extrabold uppercase tracking-wider ${
              isDark ? 'text-white' : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-blue-500'
            }`}>
              KÍCH HOẠT BẢO HÀNH
            </h1>
            <p className={`text-[10px] font-bold mt-1 uppercase tracking-widest ${
              isDark ? 'text-cyan-300' : 'text-gray-500'
            }`}>
              Truliva Official
            </p>
          </div>

          {/* STEP 1: Enter Details & Invoice */}
          {step === 1 && (
            <form onSubmit={handleCheckAndProceed} className="space-y-5">
              <div className={`border rounded-xl p-4 text-center ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-blue-50/40 border-blue-100/60'
              }`}>
                <Sparkles size={20} className={`mx-auto mb-2 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
                <p className={`text-xs leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                  Vui lòng nhập số Serial sản phẩm trên tem dán thiết bị để bắt đầu kích hoạt bảo hành.
                </p>
              </div>

              {/* Serial input */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                  Số Serial sản phẩm (*)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Mẫu: 1858 260 207 *****"
                    value={serialInput}
                    onChange={(e) => setSerialInput(formatSerialNumber(e.target.value))}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none font-mono font-bold tracking-wider transition-all ${
                      isDark 
                        ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20' 
                        : 'bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-800 placeholder:text-gray-400'
                    }`}
                  />
                  {serialValidation.status === 'CHECKING' && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 size={16} className={`animate-spin ${isDark ? 'text-cyan-400' : 'text-blue-500'}`} />
                    </div>
                  )}
                </div>

                {/* 1. Trạng thái IDLE / Chưa nhập đủ 15 ký tự */}
                {serialValidation.status === 'IDLE' && serialInput.replace(/[^a-zA-Z0-9]/g, '').length < 15 && (
                  <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                    * Nhập đủ 15 ký tự chữ và số trên tem máy để kiểm tra
                  </p>
                )}

                {/* 2. Trạng thái KHÔNG TÌM THẤY / INVALID */}
                {serialValidation.status === 'NOT_FOUND' && (
                  <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 animate-fade-in">
                    <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-rose-900">Số Serial không tồn tại trong hệ thống</p>
                      <p className="text-gray-600 leading-relaxed">
                        Vui lòng kiểm tra lại dãy 15 ký tự trên tem dán hoặc liên hệ hotline để được hỗ trợ.
                      </p>
                      <div className="pt-1">
                        <a
                          href="tel:1900638463"
                          className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800"
                        >
                          📞 Hotline CSKH: 1900 63 84 63
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Trạng thái ĐÃ KÍCH HOẠT BẢO HÀNH */}
                {serialValidation.status === 'ACTIVATED' && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs p-4 rounded-2xl animate-fade-in space-y-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      {/* Product Thumbnail if available */}
                      {serialValidation.imageUrl ? (
                        <div className="w-16 h-16 bg-white rounded-xl p-1.5 flex items-center justify-center shrink-0 border border-amber-200/80 shadow-xs overflow-hidden">
                          <img 
                            src={serialValidation.imageUrl} 
                            alt={serialValidation.displayName || serialValidation.model} 
                            className="max-w-full max-h-full object-contain" 
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 text-amber-700">
                          <AlertTriangle size={24} />
                        </div>
                      )}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] uppercase tracking-wider">
                          <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                          <span>Đã kích hoạt bảo hành</span>
                        </div>
                        <p className="font-bold text-sm text-gray-900 leading-snug break-words">
                          {serialValidation.displayName || serialValidation.productLine || serialValidation.model}
                        </p>
                        <p className="text-gray-600 text-[11px]">
                          Model: <span className="font-mono font-semibold text-gray-800">{serialValidation.model}</span>
                          {serialValidation.expiryDate && (
                            <span className="ml-2 text-rose-700 font-semibold">• Hạn đến: {serialValidation.expiryDate}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                      <p className="text-gray-600 text-[11px]">
                        Cần hỗ trợ tra cứu thông tin?
                      </p>
                      <a
                        href="tel:1900638463"
                        className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition shadow-xs"
                      >
                        <PhoneCall size={13} /> Hotline 1900 63 84 63
                      </a>
                    </div>
                  </div>
                )}

                {/* 4. Trạng thái HỢP LỆ & CHƯA KÍCH HOẠT */}
                {serialValidation.status === 'VALID' && (
                  <div className={`mt-3 border text-xs p-3.5 rounded-2xl flex items-center gap-3.5 animate-fade-in shadow-sm ${
                    isDark 
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' 
                      : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                  }`}>
                    {/* Thumbnail Image */}
                    {serialValidation.imageUrl ? (
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl p-1.5 flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${
                        isDark ? 'bg-slate-900 border-emerald-500/30' : 'bg-white border-emerald-200/70'
                      }`}>
                        <img 
                          src={serialValidation.imageUrl} 
                          alt={serialValidation.displayName || serialValidation.model} 
                          className="max-w-full max-h-full object-contain" 
                        />
                      </div>
                    ) : (
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                        isDark ? 'bg-emerald-900/60 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <ShieldCheck size={28} />
                      </div>
                    )}

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                          <CheckCircle2 size={12} className="text-slate-950" />
                          Hợp lệ
                        </span>
                        <span className={`text-[11px] font-bold ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>
                          Bảo hành: {serialValidation.totalMonths} tháng
                        </span>
                      </div>
                      
                      <h4 className={`font-bold text-sm leading-snug break-words ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {serialValidation.displayName || serialValidation.productLine || serialValidation.model}
                      </h4>

                      <p className={`text-[11px] font-mono ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                        Model: <span className="font-semibold">{serialValidation.model}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Inputs & Upload Invoice */}
              {serialValidation.status === 'VALID' && (
                <div className={`space-y-4 pt-2 border-t animate-fade-in ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                      Thông tin người sử dụng (*)
                    </label>
                    <div className="space-y-3">
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          required
                          placeholder="Họ và tên khách hàng *"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all ${
                            isDark 
                              ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20' 
                              : 'bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-800'
                          }`}
                        />
                      </div>

                      <div className="relative">
                        <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          required
                          placeholder="Số điện thoại di động *"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-mono ${
                            isDark 
                              ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20' 
                              : 'bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-800'
                          }`}
                        />
                      </div>

                      {/* Dropdown select for Province/City */}
                      <div className="relative">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                        <select
                          required
                          value={province}
                          onChange={(e) => setProvince(e.target.value)}
                          className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer ${
                            isDark 
                              ? 'bg-[#152B4D] border-white/20 text-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20' 
                              : 'bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-800'
                          }`}
                        >
                          <option value="" disabled className="text-gray-400">Chọn Tỉnh/Thành phố *</option>
                          {ORDERED_VIETNAM_PROVINCES.map(p => (
                            <option key={p} value={p} className={isDark ? 'bg-[#0B1E38] text-white' : 'bg-white text-gray-800'}>{p}</option>
                          ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                          ▼
                        </div>
                      </div>

                      <div className="relative">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          required
                          placeholder="Địa chỉ cụ thể (Số nhà, đường, phường...) *"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all ${
                            isDark 
                              ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20' 
                              : 'bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-800'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Upload Invoice Image */}
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                      Ảnh chụp hóa đơn mua hàng (*)
                    </label>

                    {invoiceImageUrl ? (
                      <div className={`relative rounded-xl border overflow-hidden h-[160px] group ${
                        isDark ? 'border-white/20 bg-white/5' : 'border-gray-200 bg-gray-50'
                      }`}>
                        <img
                          src={invoiceImageUrl}
                          alt="Invoice"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <label className="bg-white text-gray-800 text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition shadow">
                            Chọn ảnh khác
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadInvoice(e.target.files[0]);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className={`border-2 border-dashed transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer h-[140px] text-center ${
                        isDark 
                          ? 'border-white/20 hover:border-cyan-400 hover:bg-white/5' 
                          : 'border-gray-200 hover:border-blue-500 hover:bg-blue-500/5'
                      }`}>
                        {uploadingImage ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 size={32} className={`animate-spin ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
                            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>Đang tải ảnh lên...</span>
                          </div>
                        ) : (
                          <>
                            <UploadCloud size={36} className="text-gray-400 mb-2" />
                            <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-600'}`}>Chụp/Tải lên hóa đơn mua hàng</span>
                            <span className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>Định dạng JPG, PNG, HEIC (tối đa 20MB)</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadInvoice(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {submitError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2 animate-fade-in font-medium">
                      <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={uploadingImage || !invoiceImageUrl || !customerName.trim() || !customerPhone.trim() || !address.trim() || !province}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Kiểm tra thông tin & Xác nhận <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </form>
          )}

        {/* STEP 2: Check & Confirm Details */}
        {step === 2 && productInfo && (
          <form onSubmit={handleSubmitActivation} className="space-y-5">
            <div className="space-y-1">
              <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-800'}`}>Kiểm tra thông tin</h3>
              <p className={`text-xs leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                Quý khách vui lòng kiểm tra lại thông tin thiết bị và thông tin đăng ký bảo hành dưới đây trước khi xác nhận.
              </p>
            </div>

            {/* Display Product Info Card */}
            <div className={`border rounded-2xl p-4 shadow-sm ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-gradient-to-r from-blue-50/80 to-sky-50/50 border-blue-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  isDark ? 'text-cyan-300 bg-cyan-950/40 border-cyan-500/30' : 'text-blue-600 bg-blue-100 border-blue-200/50'
                }`}>
                  Thông tin thiết bị
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 size={12} /> Serial hợp lệ
                </span>
              </div>

              <div className="flex items-center gap-3.5">
                {/* Product Thumbnail */}
                {productInfo.imageUrl ? (
                  <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl p-2 flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${
                    isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-blue-100'
                  }`}>
                    <img 
                      src={productInfo.imageUrl} 
                      alt={productInfo.displayName || productInfo.model} 
                      className="max-w-full max-h-full object-contain" 
                    />
                  </div>
                ) : (
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-blue-950 border border-cyan-500/20 text-cyan-400' : 'bg-blue-100 text-blue-700'
                  }`}>
                    <ShieldCheck size={32} />
                  </div>
                )}

                {/* Information */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <h3 className={`font-bold text-sm sm:text-base leading-snug break-words ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {productInfo.displayName || productInfo.productLine || productInfo.model}
                  </h3>

                  <div className={`space-y-1 text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Model:</span>
                      <span className={`font-mono font-bold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{productInfo.model}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Số Serial:</span>
                      <span className={`font-mono font-bold ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>{formatSerialNumber(productInfo.serialNumber)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Bảo hành:</span>
                      {productInfo.status === 'Đã kích hoạt' || productInfo.status === 'KH xác nhận' ? (
                        <span className="text-rose-500 font-bold">
                          Đến ngày {productInfo.warrantyExpiryDate ? new Date(productInfo.warrantyExpiryDate).toLocaleDateString('vi-VN') : '—'}
                        </span>
                      ) : (
                        <span className={`font-bold ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}>
                          {productInfo.totalMonths || productInfo.standardMonths || 12} tháng
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Details Card */}
            <div className={`border rounded-xl p-4 space-y-2.5 text-xs font-medium ${
              isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-gray-50 border-gray-100 text-gray-600'
            }`}>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Khách hàng đăng ký
              </span>
              <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 pt-1">
                <span className="text-gray-400">Họ và tên:</span>
                <span className={`col-span-2 font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{customerName}</span>
                
                <span className="text-gray-400">Số điện thoại:</span>
                <span className={`col-span-2 font-mono font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{customerPhone}</span>
                
                <span className="text-gray-400 text-left">Địa chỉ lắp đặt:</span>
                <span className={`col-span-2 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{address}, {province}</span>
              </div>
            </div>

            {/* Warning Banner if already activated */}
            {(productInfo.status === 'Đã kích hoạt' || productInfo.status === 'KH xác nhận') && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs px-3.5 py-3 rounded-xl flex items-start gap-2 animate-fade-in font-semibold">
                <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
                <span>Sản phẩm đã được kích hoạt bảo hành trước đó.</span>
              </div>
            )}

            {/* Warning Banner if pending approval */}
            {productInfo.status === 'Chờ duyệt' && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs px-3.5 py-3 rounded-xl flex items-start gap-2 animate-fade-in font-semibold">
                <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
                <span>Yêu cầu kích hoạt bảo hành cho sản phẩm này đang chờ duyệt.</span>
              </div>
            )}

            {submitError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2 animate-fade-in font-medium">
                <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Submit Actions */}
            {productInfo.status === 'Đã kích hoạt' || productInfo.status === 'KH xác nhận' || productInfo.status === 'Chờ duyệt' ? (
              <button
                type="button"
                disabled
                className="w-full bg-gray-200 text-gray-400 font-bold py-3 px-4 rounded-xl text-sm cursor-not-allowed border border-gray-300/30"
              >
                {productInfo.status === 'Chờ duyệt' ? 'Đang chờ duyệt bảo hành' : 'Thiết bị đã kích hoạt bảo hành'}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Đang gửi yêu cầu...
                  </>
                ) : (
                  'Kích hoạt bảo hành'
                )}
              </button>
            )}
          </form>
        )}

        {/* STEP 3: Success Screen (e-Warranty Card) */}
        {step === 3 && productInfo && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1 border ${
              isDark ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
            }`}>
              <CheckCircle size={32} />
            </div>

            <div>
              <h2 className={`text-lg font-extrabold uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Kích hoạt thành công!
              </h2>
              <p className={`text-xs mt-2 leading-relaxed px-2 font-medium ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                {successMessage || 'Bảo hành điện tử cho thiết bị của Quý khách đã được kích hoạt thành công trên hệ thống Truliva.'}
              </p>
              <p className={`text-xs mt-2.5 font-semibold px-3 py-2.5 rounded-xl leading-relaxed border ${
                isDark ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
              }`}>
                Tin nhắn xác nhận kích hoạt bảo hành cùng mã Voucher ưu đãi đã được gửi qua Zalo đến số điện thoại {customerPhone}.
              </p>
            </div>

            {/* Electronic Warranty Card Mockup */}
            <div className={`border rounded-xl p-4 text-left shadow-md relative overflow-hidden ${
              isDark ? 'bg-gradient-to-br from-[#0E274A] to-[#08172D] border-cyan-500/30 text-white' : 'bg-gradient-to-br from-white to-blue-50/30 border-blue-100 text-slate-800'
            }`}>
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className={`flex justify-between items-center border-b pb-2.5 mb-3 ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Thẻ bảo hành điện tử
                </span>
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                  Đã kích hoạt
                </span>
              </div>

              <div className="space-y-2 text-xs font-semibold">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Model Thiết bị</span>
                  <span className={`mt-0.5 block ${isDark ? 'text-white' : 'text-gray-800'}`}>{productInfo.model}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Số Serial</span>
                  <span className={`mt-0.5 block font-mono tracking-wider ${isDark ? 'text-white' : 'text-gray-800'}`}>{productInfo.serialNumber}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Thời hạn bảo hành dự kiến</span>
                  {productInfo.warrantyExpiryDate ? (
                    <span className={`mt-0.5 block ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}>
                      Đến ngày {new Date(productInfo.warrantyExpiryDate).toLocaleDateString('vi-VN')}
                    </span>
                  ) : (
                    <span className={`mt-0.5 block ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}>{productInfo.totalMonths || productInfo.standardMonths || 12} tháng</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Họ và tên khách hàng</span>
                  <span className={`mt-0.5 block ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>{customerName}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Số điện thoại</span>
                  <span className={`mt-0.5 block font-mono ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>{customerPhone}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setStep(0);
                setSerialInput('');
                setProductInfo(null);
                setCustomerName('');
                setCustomerPhone('');
                setAddress('');
                setProvince('');
                setInvoiceImageUrl('');
                setSubmitError('');
              }}
              className={`w-full font-bold py-3 px-4 rounded-xl text-sm transition-all cursor-pointer ${
                isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              Đăng ký kích hoạt sản phẩm khác
            </button>
          </div>
        )}

        </div>
      </div>

      {/* Zalo OA Button */}
      <a
        href="https://zalo.me/3870382725035413507"
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full max-w-md border font-bold py-3.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2.5 mb-4 relative z-10 active:scale-[0.98] mx-auto cursor-pointer ${
          isDark 
            ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white/90 hover:text-white' 
            : 'bg-white/90 hover:bg-white border-blue-200 text-[#1B3A6B] shadow-xs'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#0068ff] shrink-0">
          <path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2zm3.36 12.164h-4.32l4.316-5.064c.2-.236.033-.593-.274-.593H10.15a.394.394 0 0 0-.394.394v.822c0 .218.176.394.394.394h3.766L9.6 13.18a.394.394 0 0 0 .274.593h4.945a.394.394 0 0 0 .394-.394V12.56a.394.394 0 0 0-.394-.394z"/>
        </svg>
        <span className="tracking-wide">Hỗ trợ Zalo OA: Truliva chuyên nghiệp và tận tâm</span>
      </a>

      <div className={`text-center text-[10px] relative z-10 max-w-xs leading-relaxed mx-auto pb-6 ${
        isDark ? 'text-white/40' : 'text-slate-400'
      }`}>
        <p>© 2026 Truliva Vietnam. Tất cả quyền được bảo lưu.</p>
        <p className="mt-1">Hotline CSKH: 1900 63 84 63 (Hỗ trợ 8h00 - 18h00 hàng ngày)</p>
      </div>
    </div>
  );
}

