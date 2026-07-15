import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ArrowRight, UploadCloud, CheckCircle, AlertTriangle, Smartphone, User, MapPin, Loader2, Sparkles, ChevronLeft, Phone } from 'lucide-react';
import { API_URL } from '../../api/client';

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
  'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 'Đắk Nông', 'Điện Biên', 'Đồng Nai',
  'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 'Hà Tĩnh', 'Hải Dương',
  'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang',
  'Kon Tum', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định',
  'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình',
  'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng', 'Sơn La',
  'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang',
  'TP Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
];

interface ProductInfo {
  serialNumber: string;
  model: string;
  standardMonths: number;
  totalMonths: number;
  status: string;
  warrantyExpiryDate?: string | null;
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
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  
  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-fill serial if provided in URL
  useEffect(() => {
    if (serialFromUrl) {
      setSerialInput(formatSerialNumber(serialFromUrl));
      setStep(1);
    }
  }, [serialFromUrl]);

  // Auto-lookup customer data when serial reaches 15 chars
  useEffect(() => {
    const cleanSerial = serialInput.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanSerial.length !== 15) {
      setAutoFilled(false);
      return;
    }

    const timer = setTimeout(async () => {
      setAutoFillLoading(true);
      try {
        const response = await fetch(`${API_URL}/serials/public/check/${encodeURIComponent(cleanSerial)}`);
        if (response.ok) {
          const data = await response.json();
          // Auto-fill customer fields only if they are currently empty
          if (data.customerName && !customerName) setCustomerName(data.customerName);
          if (data.customerPhone && !customerPhone) setCustomerPhone(data.customerPhone);
          if (data.address && !address) setAddress(data.address);
          if (data.province && !province) setProvince(data.province);
          if (data.customerName || data.customerPhone) setAutoFilled(true);
        }
      } catch (err) {
        // Silently ignore - user will see errors when submitting
      } finally {
        setAutoFillLoading(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [serialInput]); // eslint-disable-line react-hooks/exhaustive-deps

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

    if (!cleanSerial) {
      setSubmitError('Vui lòng nhập số Serial của sản phẩm');
      return;
    }
    if (cleanSerial.length !== 15) {
      setSubmitError('Số Serial bắt buộc phải gồm đúng 15 ký tự chữ và số.');
      return;
    }
    if (!customerName.trim()) {
      setSubmitError('Vui lòng điền họ và tên người sử dụng');
      return;
    }
    if (!customerPhone.trim()) {
      setSubmitError('Vui lòng điền số điện thoại di động');
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

    setCheckingSerial(true);
    setSubmitError('');
    setProductInfo(null);

    try {
      const response = await fetch(`${API_URL}/serials/public/check/${encodeURIComponent(cleanSerial.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Số Serial không hợp lệ hoặc đã được kích hoạt');
      }

      setProductInfo({
        serialNumber: data.serialNumber,
        model: data.model,
        standardMonths: data.standardMonths,
        totalMonths: data.totalMonths,
        status: data.status,
        warrantyExpiryDate: data.warrantyExpiryDate
      });
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'Số Serial không tìm thấy trong hệ thống hoặc không hợp lệ.');
    } finally {
      setCheckingSerial(false);
    }
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
          status: 'Chờ duyệt',
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
      <div className="min-h-screen bg-[#1B2A4A] flex flex-col font-sans antialiased">

        {/* Header Bar */}
        <header className="flex items-center justify-between px-5 py-4">
          <img src="/logo.png" alt="Truliva" className="h-10 object-contain brightness-0 invert" />
          <a href="tel:19006364" className="flex items-center gap-1.5 text-white/90 hover:text-white transition">
            <Phone size={14} />
            <span className="text-sm font-bold tracking-wide">1900 6364</span>
          </a>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-8">
          <div className="w-full max-w-sm space-y-4">

            {/* Kích hoạt bảo hành sản phẩm */}
            <button
              onClick={() => setStep(1)}
              className="w-full bg-[#E53935] hover:bg-[#D32F2F] active:scale-[0.98] text-white font-bold py-4 px-5 rounded-xl text-base transition-all shadow-lg shadow-red-900/30 flex items-center gap-4 border border-red-400/20"
            >
              <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                <ShieldCheck size={26} className="text-white" />
              </div>
              <div className="text-left">
                <span className="block text-[15px] font-extrabold leading-tight">Kích hoạt</span>
                <span className="block text-[15px] font-extrabold leading-tight">Bảo hành sản phẩm</span>
              </div>
            </button>

            {/* Quan tâm Zalo Truliva */}
            <a
              href="https://zalo.me/3870382725035413507"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#0068FF] hover:bg-[#0055DD] active:scale-[0.98] text-white font-bold py-4 px-5 rounded-xl text-base transition-all shadow-lg shadow-blue-900/30 flex items-center gap-4 border border-blue-400/20"
            >
              <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                  <path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2zm3.36 12.164h-4.32l4.316-5.064c.2-.236.033-.593-.274-.593H10.15a.394.394 0 0 0-.394.394v.822c0 .218.176.394.394.394h3.766L9.6 13.18a.394.394 0 0 0 .274.593h4.945a.394.394 0 0 0 .394-.394V12.56a.394.394 0 0 0-.394-.394z"/>
                </svg>
              </div>
              <div className="text-left">
                <span className="block text-[15px] font-extrabold leading-tight">Quan tâm Zalo</span>
                <span className="block text-[15px] font-extrabold leading-tight">Truliva Vietnam</span>
              </div>
            </a>

          </div>
        </div>

        {/* Footer */}
        <footer className="text-center px-5 pb-6 space-y-4">
          <div className="flex items-center justify-center gap-2 text-white/50 text-[11px] font-medium flex-wrap">
            <a href="#" className="hover:text-white/80 transition">SITEMAP</a>
            <span>|</span>
            <a href="#" className="hover:text-white/80 transition">COOKIE POLICY</a>
            <span>|</span>
            <a href="#" className="hover:text-white/80 transition">T&C</a>
          </div>
          <p className="text-white/40 text-[11px] font-medium">© 2026 Truliva Vietnam. Tất cả quyền được bảo lưu.</p>
          
          {/* Social Icons */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <a href="#" className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href="#" className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
            <a href="https://zalo.me/3870382725035413507" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2z"/></svg>
            </a>
          </div>
        </footer>

      </div>
    );
  }

  // ==================== STEP 1-3: FORM FLOW ====================
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0D1B3E] via-[#142952] to-[#1B3A6B] text-gray-800 flex flex-col items-center justify-center p-4 font-sans antialiased relative overflow-hidden">
      
      {/* Decorative background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-blue-400/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-xl shadow-blue-950/10 p-6 relative z-10 my-8">
        
        {/* Banner Image */}
        <div className="w-full rounded-xl overflow-hidden mb-6 shadow-sm border border-blue-100">
          <img src="/banner.png" alt="Truliva Banner" className="w-full h-auto object-cover" />
        </div>

        {/* Branding Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-50 border border-blue-200/50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md shadow-blue-500/5">
            <ShieldCheck size={36} className="text-blue-600" />
          </div>
          <h1 className="text-xl font-extrabold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-blue-500">
            KÍCH HOẠT BẢO HÀNH
          </h1>
          <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Truliva Official
          </p>
        </div>

        {/* STEP 1: Enter Details & Invoice */}
        {step === 1 && (
          <form onSubmit={handleCheckAndProceed} className="space-y-4">
            <div className="bg-blue-50/40 border border-blue-100/60 rounded-xl p-4 text-center">
              <Sparkles size={20} className="mx-auto text-blue-600 mb-2" />
              <p className="text-xs text-gray-600 leading-relaxed font-medium">
                Vui lòng điền đầy đủ các thông tin cá nhân và tải lên hóa đơn mua hàng để thực hiện đăng ký kích hoạt bảo hành thiết bị.
              </p>
            </div>

            {/* Serial input */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Số Serial sản phẩm (*)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Mẫu: 1858 260 207 *****"
                  value={serialInput}
                  onChange={(e) => setSerialInput(formatSerialNumber(e.target.value))}
                  disabled={checkingSerial}
                  className="w-full bg-blue-50/10 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-2.5 text-sm outline-none text-gray-800 font-mono font-bold tracking-wider transition-all placeholder:text-gray-400"
                />
                {autoFillLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 size={16} className="animate-spin text-blue-500" />
                  </div>
                )}
              </div>
              {autoFilled && (
                <p className="text-[11px] text-emerald-600 mt-1.5 font-medium flex items-center gap-1">
                  <CheckCircle size={12} /> Đã tự động điền thông tin khách hàng từ hệ thống
                </p>
              )}
            </div>

            {/* Customer Inputs */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
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
                    className="w-full bg-blue-50/10 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
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
                    className="w-full bg-blue-50/10 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
                  />
                </div>

                {/* Dropdown select for Province/City */}
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                  <select
                    required
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full bg-blue-50/10 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all appearance-none cursor-pointer"
                  >
                    <option value="" disabled className="text-gray-400">Chọn Tỉnh/Thành phố *</option>
                    {VIETNAM_PROVINCES.map(p => (
                      <option key={p} value={p}>{p}</option>
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
                    className="w-full bg-blue-50/10 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Upload Invoice Image */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Ảnh chụp hóa đơn mua hàng (*)
              </label>

              {invoiceImageUrl ? (
                <div className="relative rounded-xl border border-gray-200 overflow-hidden h-[160px] group bg-gray-50">
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
                <label className="border-2 border-dashed border-gray-200 hover:border-blue-500 hover:bg-blue-500/5 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer h-[140px] text-center">
                  {uploadingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="animate-spin text-blue-600" />
                      <span className="text-xs text-gray-500 font-medium">Đang tải ảnh lên...</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud size={36} className="text-gray-400 mb-2" />
                      <span className="text-xs font-bold text-gray-600">Chụp/Tải lên hóa đơn mua hàng</span>
                      <span className="text-[10px] text-gray-400 mt-1">Định dạng JPG, PNG, HEIC (tối đa 20MB)</span>
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
              <div className="bg-rose-500/5 border border-rose-500/10 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2 animate-fade-in font-medium">
                <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={checkingSerial || uploadingImage || !invoiceImageUrl || !serialInput.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkingSerial ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Đang kiểm tra...
                </>
              ) : (
                <>
                  Kiểm tra thông tin <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: Check & Confirm Details */}
        {step === 2 && productInfo && (
          <form onSubmit={handleSubmitActivation} className="space-y-5">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-bold outline-none mb-2"
            >
              <ChevronLeft size={16} /> Quay lại chỉnh sửa
            </button>

            <div className="space-y-1">
              <h3 className="font-bold text-gray-800 text-base">Kiểm tra thông tin</h3>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">
                Quý khách vui lòng kiểm tra lại thông tin thiết bị và thông tin đăng ký bảo hành dưới đây trước khi xác nhận.
              </p>
            </div>

            {/* Display Product Info Card */}
            <div className="bg-gradient-to-r from-blue-50 to-sky-50/50 border border-blue-100 rounded-xl p-4">
              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200/50 uppercase tracking-wider">
                Thông tin thiết bị
              </span>
              <h3 className="font-bold text-gray-800 text-base mt-2">{productInfo.model}</h3>
              <div className="mt-2 space-y-1.5 text-xs text-gray-600 font-medium">
                <div className="flex justify-between">
                  <span className="text-gray-400">Số Serial:</span>
                  <span className="font-mono text-gray-700 font-bold">{productInfo.serialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Thời gian bảo hành:</span>
                  {productInfo.status === 'Đã kích hoạt' || productInfo.status === 'KH xác nhận' ? (
                    <span className="text-rose-600 font-bold">
                      Đến ngày {productInfo.warrantyExpiryDate ? new Date(productInfo.warrantyExpiryDate).toLocaleDateString('vi-VN') : '—'}
                    </span>
                  ) : (
                    <span className="text-blue-600 font-bold">
                      {productInfo.totalMonths || productInfo.standardMonths || 12} tháng
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Customer Details Card */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2.5 text-xs text-gray-600 font-medium">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Khách hàng đăng ký
              </span>
              <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 pt-1">
                <span className="text-gray-400">Họ và tên:</span>
                <span className="col-span-2 text-gray-800 font-bold">{customerName}</span>
                
                <span className="text-gray-400">Số điện thoại:</span>
                <span className="col-span-2 text-gray-800 font-mono font-bold">{customerPhone}</span>
                
                <span className="text-gray-400 text-left">Địa chỉ lắp đặt:</span>
                <span className="col-span-2 text-gray-800">{address}, {province}</span>
              </div>
            </div>

            {/* Warning Banner if already activated */}
            {(productInfo.status === 'Đã kích hoạt' || productInfo.status === 'KH xác nhận') && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs px-3.5 py-3 rounded-xl flex items-start gap-2 animate-fade-in font-semibold">
                <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                <span>Sản phẩm đã được kích hoạt bảo hành trước đó.</span>
              </div>
            )}

            {/* Warning Banner if pending approval */}
            {productInfo.status === 'Chờ duyệt' && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs px-3.5 py-3 rounded-xl flex items-start gap-2 animate-fade-in font-semibold">
                <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                <span>Yêu cầu kích hoạt bảo hành cho sản phẩm này đang chờ duyệt.</span>
              </div>
            )}

            {submitError && (
              <div className="bg-rose-500/5 border border-rose-500/10 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2 animate-fade-in font-medium">
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
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
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
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-1">
              <CheckCircle size={32} className="text-emerald-600" />
            </div>

            <div>
              <h2 className="text-lg font-extrabold text-gray-800 uppercase tracking-wider">
                Đăng ký thành công!
              </h2>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed px-2 font-medium">
                {successMessage || 'Yêu cầu kích hoạt bảo hành điện tử của quý khách đã được lưu nhận trên hệ thống.'}
              </p>
              <p className="text-xs text-blue-700 mt-2.5 font-semibold bg-blue-500/5 border border-blue-500/10 px-3 py-2.5 rounded-xl leading-relaxed">
                Hướng dẫn xác nhận kích hoạt bảo hành đã được gửi qua tin nhắn Zalo đến số điện thoại di động {customerPhone}. Quý khách vui lòng kiểm tra tin nhắn để hoàn tất.
              </p>
            </div>

            {/* Electronic Warranty Card Mockup */}
            <div className="bg-gradient-to-br from-white to-blue-50/30 border border-blue-100 rounded-xl p-4 text-left shadow-md relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 mb-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Thẻ bảo hành điện tử
                </span>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  Chờ phê duyệt
                </span>
              </div>

              <div className="space-y-2 text-xs font-semibold">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Model Thiết bị</span>
                  <span className="text-gray-800 mt-0.5 block">{productInfo.model}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Số Serial</span>
                  <span className="text-gray-800 mt-0.5 block font-mono tracking-wider">{productInfo.serialNumber}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Thời hạn bảo hành dự kiến</span>
                  {productInfo.warrantyExpiryDate ? (
                    <span className="text-blue-600 mt-0.5 block">
                      Đến ngày {new Date(productInfo.warrantyExpiryDate).toLocaleDateString('vi-VN')}
                    </span>
                  ) : (
                    <span className="text-blue-600 mt-0.5 block">{productInfo.totalMonths || productInfo.standardMonths || 12} tháng</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Họ và tên khách hàng</span>
                  <span className="text-gray-700 mt-0.5 block">{customerName}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Số điện thoại</span>
                  <span className="text-gray-700 mt-0.5 block font-mono">{customerPhone}</span>
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
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl text-sm transition-all"
            >
              Đăng ký kích hoạt sản phẩm khác
            </button>
          </div>
        )}

      </div>

      {/* Zalo OA Button */}
      <a
        href="https://zalo.me/3870382725035413507"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full max-w-md bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2.5 mb-4 relative z-10 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#0068ff] shrink-0">
          <path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2zm3.36 12.164h-4.32l4.316-5.064c.2-.236.033-.593-.274-.593H10.15a.394.394 0 0 0-.394.394v.822c0 .218.176.394.394.394h3.766L9.6 13.18a.394.394 0 0 0 .274.593h4.945a.394.394 0 0 0 .394-.394V12.56a.394.394 0 0 0-.394-.394z"/>
        </svg>
        <span className="tracking-wide">Hỗ trợ Zalo OA: Truliva chuyên nghiệp và tận tâm</span>
      </a>

      <div className="text-center text-[10px] text-white/40 relative z-10 max-w-xs leading-relaxed">
        <p>© 2026 Truliva Vietnam. Tất cả quyền được bảo lưu.</p>
        <p className="mt-1">Hotline CSKH: 1900 6364 (Hỗ trợ 8h00 - 18h00 hàng ngày)</p>
      </div>

    </div>
  );
}
