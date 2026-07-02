import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ArrowRight, UploadCloud, CheckCircle, AlertTriangle, Smartphone, User, MapPin, Loader2, Sparkles } from 'lucide-react';
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

export default function WarrantyActivate() {
  const [searchParams] = useSearchParams();
  const serialFromUrl = searchParams.get('serial') || '';

  // Form states
  const [serialInput, setSerialInput] = useState(serialFromUrl);
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [serialError, setSerialError] = useState('');
  
  // Step tracking: 1 = Enter Serial, 2 = Customer details & invoice, 3 = Success
  const [step, setStep] = useState(1);
  const [productInfo, setProductInfo] = useState<{
    serialNumber: string;
    model: string;
    standardMonths: number;
  } | null>(null);

  // Customer info states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [invoiceImageUrl, setInvoiceImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-check serial if provided in URL
  useEffect(() => {
    if (serialFromUrl) {
      checkSerialNumber(serialFromUrl);
    }
  }, [serialFromUrl]);

  const checkSerialNumber = async (sn: string) => {
    const clean = sn.replace(/[^a-zA-Z0-9]/g, '');
    if (!clean) {
      setSerialError('Vui lòng nhập số Serial của sản phẩm');
      return;
    }
    if (clean.length !== 15) {
      setSerialError('Số Serial bắt buộc phải gồm đúng 15 ký tự chữ và số.');
      return;
    }

    setCheckingSerial(true);
    setSerialError('');
    setProductInfo(null);

    try {
      const response = await fetch(`${API_URL}/serials/public/check/${encodeURIComponent(sn.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Số Serial không hợp lệ hoặc đã được kích hoạt');
      }

      setProductInfo({
        serialNumber: data.serialNumber,
        model: data.model,
        standardMonths: data.standardMonths
      });
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setSerialError(err.message || 'Lỗi kiểm tra số Serial. Vui lòng thử lại.');
    } finally {
      setCheckingSerial(false);
    }
  };

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

  const handleSubmitActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productInfo) return;

    if (!customerName.trim() || !customerPhone.trim() || !address.trim() || !province.trim() || !invoiceImageUrl) {
      setSubmitError('Vui lòng điền đầy đủ các thông tin bắt buộc và tải lên ảnh chụp hóa đơn');
      return;
    }

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
          province: province.trim(),
          invoiceImageUrl
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi gửi yêu cầu kích hoạt bảo hành');
      }

      setSuccessMessage(data.message);
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'Lỗi gửi yêu cầu kích hoạt. Vui lòng liên hệ hotline hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FDF8F5] via-[#F9EBE0] to-[#F3DCD0] text-gray-800 flex flex-col items-center justify-center p-4 font-sans antialiased relative overflow-hidden">
      
      {/* Decorative background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-orange-400/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl border border-orange-100 rounded-2xl shadow-xl shadow-orange-950/5 p-6 relative z-10 my-8">
        
        {/* Banner Image */}
        <div className="w-full rounded-xl overflow-hidden mb-6 shadow-sm border border-orange-100">
          <img src="/banner.png" alt="Pure Vita Banner" className="w-full h-auto object-cover" />
        </div>

        {/* Branding Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-50 border border-orange-200/50 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/5">
            <ShieldCheck size={36} className="text-orange-500" />
          </div>
          <h1 className="text-xl font-extrabold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-600">
            KÍCH HOẠT BẢO HÀNH
          </h1>
          <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Pure Vita Official
          </p>
        </div>

        {/* STEP 1: Enter Serial */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-orange-50/40 border border-orange-100/60 rounded-xl p-4 text-center">
              <Sparkles size={20} className="mx-auto text-orange-500 mb-2" />
              <p className="text-xs text-gray-600 leading-relaxed font-medium">
                Vui lòng nhập số Serial (phía sau thân máy hoặc vỏ hộp) để kiểm tra thông tin thiết bị và bắt đầu quá trình kích hoạt bảo hành điện tử.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Số Serial sản phẩm
              </label>
              <input
                type="text"
                placeholder="Mẫu: 1858 260 207 *****"
                value={serialInput}
                onChange={(e) => setSerialInput(formatSerialNumber(e.target.value))}
                disabled={checkingSerial}
                className="w-full bg-orange-50/10 border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 py-3 text-sm outline-none text-gray-800 font-mono font-bold tracking-wider transition-all placeholder:text-gray-400"
              />
            </div>

            {serialError && (
              <div className="bg-rose-500/5 border border-rose-500/10 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2 animate-fade-in font-medium">
                <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
                <span>{serialError}</span>
              </div>
            )}

            <button
              onClick={() => checkSerialNumber(serialInput)}
              disabled={checkingSerial || !serialInput.trim()}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-orange-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
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
          </div>
        )}

        {/* STEP 2: Customer Details & Invoice Image */}
        {step === 2 && productInfo && (
          <form onSubmit={handleSubmitActivation} className="space-y-4">
            
            {/* Display Product Info */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50/50 border border-orange-100 rounded-xl p-4">
              <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded border border-orange-200/50 uppercase tracking-wider">
                Thiết bị hợp lệ
              </span>
              <h3 className="font-bold text-gray-800 text-base mt-2">{productInfo.model}</h3>
              <div className="mt-2 space-y-1 text-xs text-gray-600 font-medium">
                <div className="flex justify-between">
                  <span className="text-gray-400">Số Serial:</span>
                  <span className="font-mono text-gray-700">{productInfo.serialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bảo hành mặc định:</span>
                  <span className="text-orange-600">{productInfo.standardMonths} tháng</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 my-4" />

            {/* Customer Inputs */}
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Thông tin khách hàng mua máy
            </h4>

            <div className="space-y-3">
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="Họ và tên người sử dụng *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-orange-50/10 border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
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
                  className="w-full bg-orange-50/10 border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
                />
              </div>

              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="Tỉnh/Thành phố nơi lắp đặt *"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full bg-orange-50/10 border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
                />
              </div>

              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="Địa chỉ cụ thể (Số nhà, đường, phường...) *"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-orange-50/10 border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-gray-800 transition-all"
                />
              </div>
            </div>

            {/* Upload Invoice Image */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
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
                <label className="border-2 border-dashed border-gray-200 hover:border-orange-500 hover:bg-orange-500/5 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer h-[140px] text-center">
                  {uploadingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="animate-spin text-orange-500" />
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

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3 px-4 rounded-xl text-sm transition-all"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingImage || !invoiceImageUrl}
                className="w-2/3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-orange-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Đang gửi...
                  </>
                ) : (
                  'Kích hoạt ngay'
                )}
              </button>
            </div>
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
              <p className="text-xs text-orange-700 mt-2 font-semibold bg-orange-500/5 border border-orange-500/10 px-3 py-2 rounded-xl">
                Đội ngũ chăm sóc khách hàng của Pure Vita sẽ đối chiếu hình ảnh hóa đơn mua hàng và phê duyệt bảo hành chính thức cho sản phẩm trong vòng 24h làm việc.
              </p>
            </div>

            {/* Electronic Warranty Card Mockup */}
            <div className="bg-gradient-to-br from-white to-orange-50/30 border border-orange-100 rounded-xl p-4 text-left shadow-md relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-orange-500/5 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 mb-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Thẻ bảo hành điện tử
                </span>
                <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">
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
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Thời hạn bảo hành</span>
                  <span className="text-orange-600 mt-0.5 block">{productInfo.standardMonths} tháng</span>
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
                setStep(1);
                setSerialInput('');
                setProductInfo(null);
                setCustomerName('');
                setCustomerPhone('');
                setAddress('');
                setProvince('');
                setInvoiceImageUrl('');
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
        className="w-full max-w-md bg-white hover:bg-orange-50/50 border border-orange-100 text-gray-700 hover:text-orange-600 font-bold py-3.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2.5 mb-4 relative z-10 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#0068ff] shrink-0">
          <path d="M12.003 2C6.478 2 2 6.136 2 11.238c0 3.125 1.688 5.88 4.298 7.48-.12.443-.655 2.417-.655 2.417-.06.223.167.387.352.268 0 0 2.278-1.52 3.162-2.09.91.246 1.875.38 2.846.38 5.525 0 10.003-4.137 10.003-9.24C22.006 6.137 17.528 2 12.003 2zm3.36 12.164h-4.32l4.316-5.064c.2-.236.033-.593-.274-.593H10.15a.394.394 0 0 0-.394.394v.822c0 .218.176.394.394.394h3.766L9.6 13.18a.394.394 0 0 0 .274.593h4.945a.394.394 0 0 0 .394-.394V12.56a.394.394 0 0 0-.394-.394z"/>
        </svg>
        <span className="tracking-wide">Hỗ trợ Zalo OA: Pure Vita chuyên nghiệp và tận tâm</span>
      </a>

      <div className="text-center text-[10px] text-gray-400 relative z-10 max-w-xs leading-relaxed">
        <p>© 2026 Pure Vita Vietnam. Tất cả quyền được bảo lưu.</p>
        <p className="mt-1">Hotline CSKH: 1900 638463 (Hỗ trợ 8h00 - 18h00 hàng ngày)</p>
      </div>

    </div>
  );
}
