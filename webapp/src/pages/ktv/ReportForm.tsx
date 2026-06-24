import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchApi, getOrders, getFiltersData } from '../../api/client';
import LabeledImageUploader from '../../components/LabeledImageUploader';
import { CheckCircle, ChevronLeft, Send, AlertCircle, Camera, Loader2, ChevronDown, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { enqueueReport } from '../../utils/offlineStorage';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';

import { getImageSlots, WARRANTY_SERVICE_GROUPS, REPAIR_SERVICE_GROUPS, WORK_TYPE_SERVICES } from '../../utils/workTypes';

// ── Nguồn nước options ──
const WATER_SOURCES = [
  'Nước máy trực tiếp',
  'Nước máy bồn',
  'Nước giếng',
  'Nước mưa',
];

// ── Nguyên nhân sự cố và Cách xử lý options ──
const ISSUE_TYPES = [
  'Rò rỉ nước',
  'Lỗi nguồn / Mạch điện',
  'Nước không nóng',
  'Nước không lạnh',
  'Bơm kêu to / Không hoạt động',
  'Chất lượng nước đầu ra không đạt (TDS cao)',
  'Khác (Nhập chi tiết phía dưới)',
];


// ── Kiểm tra workType có cần trường kỹ thuật không ──
function needsTechnicalFields(workType: string): boolean {
  return ['Thay lọc', 'Lắp đặt', 'Giao hàng và Lắp đặt', 'Bảo hành', 'Sửa chữa'].includes(workType);
}

export default function ReportForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const editReportId = location.state?.editReportId;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Đơn hàng ──
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');

  // ── Step 1: Thông tin chung ──
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [workType, setWorkType] = useState('');
  const [actualAmount, setActualAmount] = useState('');

  // ── Multi-select custom dropdown states ──
  const [stockProducts, setStockProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const serviceDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside handlers to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(event.target as Node)) {
        setShowServiceDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Step 2: Trường kỹ thuật (dynamic) ──
  const [serialNumber, setSerialNumber] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [tdsIn, setTdsIn] = useState('');
  const [tdsOut, setTdsOut] = useState('');
  const [waterPressure, setWaterPressure] = useState('');
  const [issueType, setIssueType] = useState('');
  const [customIssueType, setCustomIssueType] = useState('');
  const [handlingMethod, setHandlingMethod] = useState('');

  // ── Thống kê kiểm tra Serial ──
  const [serialChecking, setSerialChecking] = useState(false);
  const [serialInfo, setSerialInfo] = useState<any>(null);
  const [serialWarning, setSerialWarning] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // ── Step 3: Ảnh ──
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [isImageConfirmed, setIsImageConfirmed] = useState(false);

  // ── Step 4: Ghi chú & Submit ──
  const [notes, setNotes] = useState('');

  // Tải danh mục sản phẩm & tồn kho của KTV từ Database
  useEffect(() => {
    fetchApi('/inventory/my-stock')
      .then(res => {
        if (res && res.products) {
          setStockProducts(res.products);
          const cats = Array.from(new Set(res.products.map((p: any) => p.category).filter(Boolean))) as string[];
          setCategories(cats);
        }
      })
      .catch(err => {
        console.error('Lỗi tải thông tin tồn kho KTV, thử tải từ bộ lọc', err);
        getFiltersData()
          .then(res => {
            if (res && res.products) {
              setStockProducts(res.products.map((p: any) => ({ name: p.name, category: p.category })));
              setCategories(res.categories || []);
            }
          })
          .catch(filterErr => console.error('Lỗi tải danh mục sản phẩm', filterErr));
      });
  }, []);

  // Tải báo cáo cũ nếu đang ở chế độ chỉnh sửa (Edit Mode)
  useEffect(() => {
    if (!editReportId) return;

    setLoading(true);
    fetchApi(`/reports/${editReportId}`)
      .then((res: any) => {
        const report = res?.report;
        if (!report) {
          setError('Không tìm thấy báo cáo');
          return;
        }

        // Prefill states
        setCustomerName(report.customerName || '');
        setCustomerPhone(report.customerPhone || '');
        setAddress(report.address || '');
        setProvince(report.province || '');
        setWorkType(report.workType || '');
        
        // Khôi phục selectedItems từ products và spareParts của báo cáo cũ
        const loadedItems: any[] = [];
        const allStrings = [...(report.products || []), ...(report.spareParts || [])];
        allStrings.forEach((str: string) => {
          const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
          let name = str.trim();
          let qty = 1;
          if (match) {
            name = match[1].trim();
            qty = parseInt(match[2], 10) || 1;
          }
          if (name) {
            loadedItems.push({
              productName: name,
              sku: '',
              quantity: qty,
              price: 0
            });
          }
        });
        setSelectedItems(loadedItems);
        
        // Handle services
        if (report.serviceType) {
          setSelectedServices(report.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean));
        }

        setSerialNumber(report.serialNumber || '');
        setDistanceKm(report.distanceKm !== undefined && report.distanceKm !== null ? String(report.distanceKm) : '');
        setActualAmount(report.actualAmount !== undefined && report.actualAmount !== null ? String(report.actualAmount) : '');
        setWaterSource(report.waterSource || '');
        setTdsIn(report.tdsIn !== undefined && report.tdsIn !== null ? String(report.tdsIn) : '');
        setTdsOut(report.tdsOut !== undefined && report.tdsOut !== null ? String(report.tdsOut) : '');
        setWaterPressure(report.waterPressure !== undefined && report.waterPressure !== null ? String(report.waterPressure) : '');
        
        // Handling method and issue type
        if (['Bảo hành', 'Sửa chữa'].includes(report.workType)) {
          if (report.issueType) {
            if (ISSUE_TYPES.includes(report.issueType)) {
              setIssueType(report.issueType);
              setCustomIssueType('');
            } else {
              setIssueType('Khác (Nhập chi tiết phía dưới)');
              setCustomIssueType(report.issueType);
            }
          }
          setHandlingMethod(report.handlingMethod || '');
        }

        // Notes and ImageUrls
        setNotes(report.notes || '');
        if (report.imageUrls) {
          setImageUrls(report.imageUrls);
          setIsImageConfirmed(true);
        }

        // Selected Order Id
        if (report.orderId) {
          setSelectedOrderId(report.orderId);
          if (report.order) {
            setOrders(prevOrders => {
              if (prevOrders.some(o => o.id === report.orderId)) {
                return prevOrders;
              }
              return [report.order, ...prevOrders];
            });
          }
        }
      })
      .catch((err: any) => {
        console.error('Lỗi tải báo cáo để chỉnh sửa', err);
        setError('Không thể tải thông tin báo cáo: ' + (err.message || err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [editReportId]);

  // Đồng bộ thông tin SKU/Price cho selectedItems khi danh mục sản phẩm được tải
  useEffect(() => {
    if (stockProducts.length > 0 && selectedItems.length > 0) {
      const updated = selectedItems.map(item => {
        if (!item.sku || !item.price) {
          const matched = stockProducts.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
          if (matched) {
            return {
              ...item,
              productName: matched.name,
              sku: matched.sku || '',
              price: matched.sellingPrice || 0
            };
          }
        }
        return item;
      });
      const changed = JSON.stringify(updated) !== JSON.stringify(selectedItems);
      if (changed) {
        setSelectedItems(updated);
      }
    }
  }, [stockProducts, selectedItems]);

  const getServiceOptions = (): string[] => {
    let options: string[] = [];
    if (workType === 'Bảo hành') {
      options = Object.values(WARRANTY_SERVICE_GROUPS).flat();
    } else if (workType === 'Sửa chữa') {
      options = Object.values(REPAIR_SERVICE_GROUPS).flat();
    } else {
      options = WORK_TYPE_SERVICES[workType] || ['Công việc đã bao gồm dịch vụ'];
    }

    // Luôn bổ sung dịch vụ từ admin đã đặt nếu chưa có
    if (selectedOrderId) {
      const order = orders.find(o => o.id === selectedOrderId);
      if (order?.serviceType) {
        const list = order.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean);
        list.forEach((s: string) => {
          if (!options.includes(s)) {
            options.push(s);
          }
        });
      }
    }

    return Array.from(new Set(options));
  };

  const handleTreeSelectChange = (selectedNodeIds: string[]) => {
    const selectedProductNames = selectedNodeIds
      .filter(id => id.startsWith('PROD:'))
      .map(id => id.substring(5));

    const nextItems = selectedProductNames.map(name => {
      const existing = selectedItems.find(item => item.productName === name);
      if (existing) {
        return existing;
      }
      
      const pData = stockProducts.find(p => p.name === name);
      return {
        productName: name,
        sku: pData?.sku || '',
        quantity: 1,
        price: pData?.sellingPrice || 0
      };
    });
    
    setSelectedItems(nextItems);
  };

  const handleUpdateQuantity = (productName: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.productName === productName) {
        const nextQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: nextQty };
      }
      return item;
    }));
  };

  const handleRemoveItem = (productName: string) => {
    setSelectedItems(prev => prev.filter(item => item.productName !== productName));
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

  const checkSerial = async (serial: string) => {
    const clean = serial.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 5) {
      setSerialInfo(null);
      setSerialWarning('');
      return;
    }

    setSerialChecking(true);
    setSerialWarning('');
    try {
      const res = await fetchApi(`/reports/check-serial?serialNumber=${encodeURIComponent(clean)}`);
      if (res && res.exists) {
        setSerialInfo(res);
        setSerialWarning('');
        if (res.products && res.products.length > 0 && selectedItems.length === 0) {
          const matchedProd = res.products[0].split('x')[0].trim();
          const prodData = stockProducts.find(p => p.name.toLowerCase() === matchedProd.toLowerCase());
          setSelectedItems([{
            productName: prodData?.name || matchedProd,
            sku: prodData?.sku || '',
            quantity: 1,
            price: prodData?.sellingPrice || 0
          }]);
        }
      } else {
        setSerialInfo(null);
        if (['Bảo hành', 'Sửa chữa'].includes(workType)) {
          setSerialWarning('⚠️ Số Serial này chưa được ghi nhận lắp đặt trong hệ thống. Vui lòng kiểm tra kỹ lại tem máy xem có gõ sai không.');
        }
      }
    } catch (err) {
      console.error('Lỗi kiểm tra Serial', err);
    } finally {
      setSerialChecking(false);
    }
  };

  // Quét mã vạch Camera Effect
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    if (showScanner) {
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 }
        },
        (decodedText) => {
          const formatted = formatSerialNumber(decodedText);
          setSerialNumber(formatted);
          checkSerial(formatted);
          setShowScanner(false);
          if (html5QrCode) {
            html5QrCode.stop().catch(err => console.error("Lỗi đóng camera quét", err));
          }
        },
        () => {}
      ).catch(err => {
        console.error("Lỗi khởi chạy camera", err);
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Lỗi đóng camera quét dọn dẹp", err));
      }
    };
  }, [showScanner]);

  useEffect(() => {
    getOrders({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
      .then(res => {
        let list = res.orders;

        if (editReportId) {
          setOrders(prevOrders => {
            const merged = [...prevOrders];
            list.forEach((o: any) => {
              if (!merged.some(existing => existing.id === o.id)) {
                merged.push(o);
              }
            });
            return merged;
          });
          return;
        }

        const stateOrder = location.state?.order;
        if (stateOrder) {
          if (!list.some((o: any) => o.id === stateOrder.id)) {
            list = [stateOrder, ...list];
          }
          setOrders(list);
          setSelectedOrderId(stateOrder.id);
          
          setCustomerName(stateOrder.billFullName || stateOrder.customer?.fullName || '');
          setCustomerPhone(stateOrder.billPhoneNumber || stateOrder.customer?.phoneNumber || '');
          setProvince(stateOrder.shippingAddress?.province_name || stateOrder.customer?.provinceName || '');
          setAddress(stateOrder.shippingAddress?.full_address || stateOrder.customer?.fullAddress || '');
          
          if (stateOrder.workType) {
            setWorkType(stateOrder.workType);
            const noServiceTypes = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'];
            if (noServiceTypes.includes(stateOrder.workType) && !stateOrder.serviceType) {
              setSelectedServices(['Công việc đã bao gồm dịch vụ']);
            } else {
              setSelectedServices(stateOrder.serviceType ? stateOrder.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
            }
          } else {
            setSelectedServices(stateOrder.serviceType ? stateOrder.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
          }

          if (stateOrder.items && stateOrder.items.length > 0) {
            const initialItems = stateOrder.items.map((item: any) => {
              const name = item.productName
                || item.variationInfo?.name
                || (item.sku ? `Sản phẩm (${item.sku})` : 'Sản phẩm không tên');
              const qty = item.quantity || 1;
              return {
                productName: name,
                sku: item.sku || '',
                quantity: qty,
                price: item.price || 0
              };
            });
            setSelectedItems(initialItems);
          } else {
            setSelectedItems([]);
          }
          
          const amount = stateOrder.moneyToCollect !== undefined && stateOrder.moneyToCollect !== null
            ? stateOrder.moneyToCollect
            : (stateOrder.totalPrice !== undefined && stateOrder.totalPrice !== null ? stateOrder.totalPrice : 0);
          setActualAmount(String(amount));

        } else {
          setOrders(list);
        }
      })
      .catch(err => {
        console.error('Lỗi tải đơn hàng', err);
        const cached = localStorage.getItem('cached_ktv_orders');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            let list = parsed.orders || [];

            if (editReportId) {
              setOrders(prevOrders => {
                const merged = [...prevOrders];
                list.forEach((o: any) => {
                  if (!merged.some(existing => existing.id === o.id)) {
                    merged.push(o);
                  }
                });
                return merged;
              });
              return;
            }

            const stateOrder = location.state?.order;
            if (stateOrder) {
              if (!list.some((o: any) => o.id === stateOrder.id)) {
                list = [stateOrder, ...list];
              }
              setOrders(list);
              setSelectedOrderId(stateOrder.id);
              
              setCustomerName(stateOrder.billFullName || stateOrder.customer?.fullName || '');
              setCustomerPhone(stateOrder.billPhoneNumber || stateOrder.customer?.phoneNumber || '');
              setProvince(stateOrder.shippingAddress?.province_name || stateOrder.customer?.provinceName || '');
              setAddress(stateOrder.shippingAddress?.full_address || stateOrder.customer?.fullAddress || '');
              
              if (stateOrder.workType) {
                setWorkType(stateOrder.workType);
                const noServiceTypes = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'];
                if (noServiceTypes.includes(stateOrder.workType) && !stateOrder.serviceType) {
                  setSelectedServices(['Công việc đã bao gồm dịch vụ']);
                } else {
                  setSelectedServices(stateOrder.serviceType ? stateOrder.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                }
              } else {
                setSelectedServices(stateOrder.serviceType ? stateOrder.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
              }

              if (stateOrder.items && stateOrder.items.length > 0) {
                const initialItems = stateOrder.items.map((item: any) => {
                  const name = item.productName
                    || item.variationInfo?.name
                    || (item.sku ? `Sản phẩm (${item.sku})` : 'Sản phẩm không tên');
                  const qty = item.quantity || 1;
                  return {
                    productName: name,
                    sku: item.sku || '',
                    quantity: qty,
                    price: item.price || 0
                  };
                });
                setSelectedItems(initialItems);
              } else {
                setSelectedItems([]);
              }
              
              const amount = stateOrder.moneyToCollect !== undefined && stateOrder.moneyToCollect !== null
                ? stateOrder.moneyToCollect
                : (stateOrder.totalPrice !== undefined && stateOrder.totalPrice !== null ? stateOrder.totalPrice : 0);
              setActualAmount(String(amount));
            } else {
              setOrders(list);
            }
          } catch (e) {
            console.error('Lỗi khi phân tích danh sách đơn hàng đã lưu cache', e);
          }
        }
      });
  }, [location.state, editReportId]);

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (!orderId) {
      setCustomerName('');
      setCustomerPhone('');
      setAddress('');
      setProvince('');
      setWorkType('');
      setSelectedServices([]);
      setSelectedItems([]);
      setActualAmount('');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setCustomerName(order.billFullName || order.customer?.fullName || '');
      setCustomerPhone(order.billPhoneNumber || order.customer?.phoneNumber || '');
      setProvince(order.shippingAddress?.province_name || order.customer?.provinceName || '');
      const fullAddr = order.shippingAddress?.full_address || order.customer?.fullAddress || '';
      setAddress(fullAddr);
      if (order.workType) {
        setWorkType(order.workType);
        const noServiceTypes = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'];
        if (noServiceTypes.includes(order.workType) && !order.serviceType) {
          setSelectedServices(['Công việc đã bao gồm dịch vụ']);
        } else {
          setSelectedServices(order.serviceType ? order.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
        }
      } else {
        setSelectedServices(order.serviceType ? order.serviceType.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
      }

      // ── Mapping sản phẩm x số lượng từ items ──
      if (order.items && order.items.length > 0) {
        const initialItems = order.items.map((item: any) => {
          const name = item.productName
            || item.variationInfo?.name
            || (item.sku ? `Sản phẩm (${item.sku})` : 'Sản phẩm không tên');
          const qty = item.quantity || 1;
          return {
            productName: name,
            sku: item.sku || '',
            quantity: qty,
            price: item.price || 0
          };
        });
        setSelectedItems(initialItems);
      } else {
        setSelectedItems([]);
      }

      // ── Mapping tiền thu thực tế (moneyToCollect hoặc totalPrice) ──
      const amount = order.moneyToCollect !== undefined && order.moneyToCollect !== null
        ? order.moneyToCollect
        : (order.totalPrice !== undefined && order.totalPrice !== null ? order.totalPrice : 0);
      setActualAmount(String(amount));
    }
  };

  const handleUploadSuccess = (urls: string[], files?: File[]) => {
    setImageUrls(urls);
    if (files) {
      setReportFiles(files);
    }
    setIsImageConfirmed(true);
    setStep(3);
  };

  // Validate Step 1 trước khi tiếp
  const canProceedStep1 = (): boolean => {
    if (!serialNumber) return false;
    if (selectedServices.length === 0) return false;
    if (selectedItems.length === 0) return false;
    if (actualAmount === '') return false;
    if (needsTechnicalFields(workType)) {
      if (!waterSource || !tdsIn || !tdsOut || !waterPressure) return false;
    }
    if (['Bảo hành', 'Sửa chữa'].includes(workType)) {
      if (!issueType) return false;
      if (issueType === 'Khác (Nhập chi tiết phía dưới)' && !customIssueType) return false;
      if (!handlingMethod.trim()) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const finalIssueType = ['Bảo hành', 'Sửa chữa'].includes(workType)
      ? (issueType === 'Khác (Nhập chi tiết phía dưới)' ? customIssueType : issueType)
      : null;

    const finalHandlingMethod = ['Bảo hành', 'Sửa chữa'].includes(workType)
      ? handlingMethod.trim()
      : null;

    const legacyProducts: string[] = [];
    const legacySpareParts: string[] = [];
    selectedItems.forEach(item => {
      const prodInfo = stockProducts.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
      const isSparePart = prodInfo?.category?.toLowerCase() === 'spare part';
      const formatted = item.quantity > 1 ? `${item.productName} x${item.quantity}` : item.productName;
      if (isSparePart) {
        legacySpareParts.push(formatted);
      } else {
        legacyProducts.push(formatted);
      }
    });

    const payload = {
      customerName,
      customerPhone,
      province,
      address,
      products: legacyProducts,
      serviceType: selectedServices.join(', '),
      workType,
      serialNumber,
      distanceKm,
      actualAmount,
      waterSource: needsTechnicalFields(workType) ? waterSource : null,
      tdsIn: needsTechnicalFields(workType) ? tdsIn : null,
      tdsOut: needsTechnicalFields(workType) ? tdsOut : null,
      waterPressure: needsTechnicalFields(workType) ? waterPressure : null,
      spareParts: legacySpareParts,
      issueType: finalIssueType,
      handlingMethod: finalHandlingMethod,
      notes,
      imageUrls: navigator.onLine ? imageUrls : [], // Dùng url rỗng khi offline để SyncManager điền sau
      orderId: selectedOrderId,
      items: selectedItems.map(item => ({ productName: item.productName, quantity: item.quantity }))
    };

    try {
      if (navigator.onLine && imageUrls.length === 0) {
        setError('Báo cáo bắt buộc phải có hình ảnh xác nhận. Vui lòng quay lại bước 2 để tải ảnh.');
        setLoading(false);
        return;
      }

      if (!navigator.onLine && reportFiles.length === 0) {
        setError('Báo cáo bắt buộc phải có hình ảnh xác nhận. Vui lòng quay lại bước 2 để chọn ảnh.');
        setLoading(false);
        return;
      }

      if (editReportId) {
        if (!navigator.onLine) {
          setError('Không thể chỉnh sửa báo cáo khi ngoại tuyến. Vui lòng kết nối mạng và thử lại.');
          setLoading(false);
          return;
        }

        await fetchApi(`/reports/${editReportId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        navigate('/ktv/my-reports');
        return;
      }

      if (!navigator.onLine) {
        await enqueueReport(selectedOrderId, payload, reportFiles);
        alert('Báo cáo đã được lưu tạm ngoại tuyến và sẽ tự động đồng bộ khi thiết bị của bạn có kết nối mạng.');
        navigate('/ktv/my-orders');
        return;
      }

      await fetchApi('/reports', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      navigate('/ktv/my-reports');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const totalSteps = 3;

  return (
    <div className="card max-w-2xl mx-auto animate-fade-in">
      <h2 className="font-bold text-2xl mb-6 text-center text-[#1B3A6B]">
        {editReportId ? 'Chỉnh Sửa Báo Cáo Công Việc' : 'Báo Cáo Hoàn Thành Công Việc'}
      </h2>

      {/* Steps indicator */}
      <div className="flex justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 transform -translate-y-1/2"></div>
        <div
          className="absolute top-1/2 left-0 h-1 bg-[#1B3A6B] -z-10 transform -translate-y-1/2 transition-all duration-300"
          style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
        ></div>

        {[
          { num: 1, label: 'Thông tin & Kỹ thuật' },
          { num: 2, label: 'Hình ảnh' },
          { num: 3, label: 'Xác nhận' },
        ].map(({ num, label }) => (
          <div key={num} className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200 ${
                step > num
                  ? 'bg-green-500 text-white'
                  : step === num
                  ? 'bg-[#1B3A6B] text-white ring-4 ring-blue-100'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > num ? <CheckCircle size={16} /> : num}
            </div>
            <span className={`text-xs mt-1 ${step >= num ? 'text-[#1B3A6B] font-medium' : 'text-gray-400'}`}>{label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-error flex items-center gap-2 mb-4">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ═══════════════════════════════════════════════ */}
        {/* Step 1: Thông tin chung & Kỹ thuật */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">1. Thông tin chung & Kỹ thuật</h3>

            {/* Auto-fill từ đơn hàng */}
            <div className="form-group bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-6">
              <label className="form-label text-blue-800 font-semibold mb-2 flex items-center gap-2">
                📦 Chọn đơn hàng để báo cáo *
              </label>
              <select
                className="form-select bg-white border-blue-200 focus:border-blue-500 focus:ring-blue-500 text-sm"
                value={selectedOrderId}
                onChange={(e) => handleOrderSelect(e.target.value)}
                required
                disabled={!!editReportId}
              >
                <option value="">-- Vui lòng chọn đơn hàng --</option>
                {orders.map(o => {
                  const name = o.billFullName || o.customer?.fullName || 'Khách';
                  const addr = o.shippingAddress?.province_name || o.customer?.provinceName || '';
                  return (
                    <option key={o.id} value={o.id}>
                      Đơn #{o.pancakeOrderId} - {name} {addr ? `(${addr})` : ''}
                    </option>
                  );
                })}
              </select>
              {!selectedOrderId && (
                <p className="text-xs text-red-500 mt-1">⚠ Bắt buộc phải chọn đơn hàng để Admin có thể tracking.</p>
              )}
            </div>

            {/* Khung thông tin tự động mapping */}
            {selectedOrderId && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px 16px',
                fontSize: '13px'
              }}>
                <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '4px', fontWeight: 700, color: '#1e293b' }}>
                  📋 Thông tin khách hàng
                </div>
                
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Khách hàng</span>
                  <strong style={{ color: '#0f172a' }}>{customerName || 'N/A'}</strong>
                </div>

                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Số điện thoại</span>
                  <strong style={{ color: '#0f172a' }}>{customerPhone || 'N/A'}</strong>
                </div>
              </div>
            )}



            {/* Nhập thông tin kỹ thuật */}
            {selectedOrderId && (
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '20px 0', paddingTop: '16px' }}>
                <h3 className="font-bold mb-4 text-md text-[#1B3A6B]">🛠️ Nhập thông tin kỹ thuật</h3>

                {/* Dịch vụ thực tế - Multi-select (Tag-based) */}
                <div className={`form-group relative ${showServiceDropdown ? 'z-40' : 'z-20'}`} ref={serviceDropdownRef}>
                  <label className="form-label font-semibold text-gray-700">Dịch vụ thực tế *</label>
                  <div
                    onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-left text-sm flex flex-wrap gap-1.5 items-center cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all"
                  >
                    {selectedServices.length > 0 ? (
                      selectedServices.map(service => (
                        <span
                          key={service}
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-xs font-semibold"
                        >
                          {service}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedServices(selectedServices.filter(s => s !== service));
                            }}
                            className="text-blue-500 hover:text-blue-800 font-bold ml-0.5 text-sm"
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">-- Chọn loại dịch vụ --</span>
                    )}
                    <ChevronDown size={18} className="text-gray-400 shrink-0 ml-auto" />
                  </div>
                  
                  {showServiceDropdown && (
                    <div 
                      className="absolute z-35 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto p-2 flex flex-col gap-1"
                    >
                      {getServiceOptions().map((service) => {
                        const isChecked = selectedServices.includes(service);
                        return (
                          <div
                            key={service}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedServices(selectedServices.filter(s => s !== service));
                              } else {
                                setSelectedServices([...selectedServices, service]);
                              }
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer select-none text-[13px] transition-colors ${
                              isChecked ? 'bg-blue-50/70 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 pointer-events-none"
                              checked={isChecked}
                              readOnly
                            />
                            <span>{service}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Hợp nhất chọn sản phẩm & linh kiện bằng CategoryTreeSelect */}
                <div className="form-group relative z-30">
                  <CategoryTreeSelect
                    categories={categories}
                    products={stockProducts}
                    selected={selectedItems.map(item => `PROD:${item.productName}`)}
                    onChange={handleTreeSelectChange}
                    label="Sản phẩm & linh kiện thực tế *"
                    placeholder="Chọn sản phẩm hoặc linh kiện phát sinh..."
                  />
                </div>

                {/* Danh sách sản phẩm & linh kiện đã chọn kèm tăng giảm số lượng */}
                {selectedItems.length > 0 && (
                  <div className="form-group bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 block">
                      Danh sách sản phẩm & linh kiện sử dụng ({selectedItems.length})
                    </label>
                    <div className="flex flex-col gap-2.5">
                      {selectedItems.map(item => {
                        const prodInfo = stockProducts.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
                        const isSpare = prodInfo?.category?.toLowerCase() === 'spare part';
                        
                        return (
                          <div 
                            key={item.productName} 
                            className="flex items-center justify-between bg-white border border-slate-150 p-3 rounded-lg shadow-xs gap-3"
                          >
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-semibold text-sm text-slate-800 truncate leading-snug">
                                {item.productName}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {item.sku ? `SKU: ${item.sku}` : 'Chưa có SKU'} 
                                <span className="mx-1.5">•</span> 
                                <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${isSpare ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                                  {isSpare ? 'Linh kiện' : 'Thiết bị/Lọc'}
                                </span>
                              </span>
                            </div>
                            
                            {/* Bộ tăng giảm số lượng */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 text-slate-600 transition-colors"
                                onClick={() => handleUpdateQuantity(item.productName, -1)}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                className="w-10 text-center font-bold text-sm bg-transparent border-0 focus:outline-none focus:ring-0 p-0 text-slate-800"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 1;
                                  setSelectedItems(prev => prev.map(si => si.productName === item.productName ? { ...si, quantity: Math.max(1, val) } : si));
                                }}
                              />
                              <button
                                type="button"
                                className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 text-slate-600 transition-colors"
                                onClick={() => handleUpdateQuantity(item.productName, 1)}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 active:bg-red-100 flex items-center justify-center transition-colors ml-1.5"
                                onClick={() => handleRemoveItem(item.productName)}
                                title="Xóa"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tiền thu thực tế */}
                <div className="form-group">
                  <label className="form-label font-semibold text-gray-700">Tiền thu thực tế (VNĐ) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Nhập số tiền thu thực tế"
                    value={actualAmount}
                    onChange={e => setActualAmount(e.target.value)}
                    required
                  />
                </div>
                
                {/* Nguồn nước — cho tất cả trừ Giao hàng */}
                {needsTechnicalFields(workType) && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nguồn nước *</label>
                      <select className="form-select" value={waterSource} onChange={e => setWaterSource(e.target.value)} required>
                        <option value="">Chọn nguồn nước...</option>
                        {WATER_SOURCES.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">TDS đầu vào (ppm) *</label>
                        <input type="number" className="form-input" placeholder="Nhập số ppm" value={tdsIn} onChange={e => setTdsIn(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">TDS đầu ra (ppm) *</label>
                        <input type="number" className="form-input" placeholder="Nhập số ppm" value={tdsOut} onChange={e => setTdsOut(e.target.value)} required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Áp suất nước đầu vào (psi) *</label>
                      <input type="number" className="form-input" placeholder="Nhập số psi thực tế" value={waterPressure} onChange={e => setWaterPressure(e.target.value)} required />
                    </div>
                    {/* Linh kiện phát sinh đã được gộp chung vào CategoryTreeSelect phía trên */}
                  </>
                )}

                {/* Nguyên nhân sự cố và Cách xử lý — chỉ dành cho Bảo hành / Sửa chữa */}
                {['Bảo hành', 'Sửa chữa'].includes(workType) && (
                  <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '16px', paddingTop: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Nguyên nhân / Loại sự cố *</label>
                      <select 
                        className="form-select" 
                        value={issueType} 
                        onChange={e => {
                          setIssueType(e.target.value);
                          if (e.target.value !== 'Khác (Nhập chi tiết phía dưới)') {
                            setCustomIssueType('');
                          }
                        }} 
                        required
                      >
                        <option value="">-- Chọn Nguyên nhân / Loại sự cố --</option>
                        {ISSUE_TYPES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                    {issueType === 'Khác (Nhập chi tiết phía dưới)' && (
                      <div className="form-group">
                        <label className="form-label">Chi tiết nguyên nhân sự cố *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Mô tả nguyên nhân lỗi..." 
                          value={customIssueType} 
                          onChange={e => setCustomIssueType(e.target.value)} 
                          required 
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Cách xử lý của KTV *</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Mô tả cách xử lý của KTV..." 
                        value={handlingMethod} 
                        onChange={e => setHandlingMethod(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                )}

                {/* Seri sản phẩm — tất cả loại */}
                <div className="form-group" style={{ borderTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? 'none' : '1px dashed #cbd5e1', marginTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? '0' : '16px', paddingTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? '0' : '16px' }}>
                  <label className="form-label flex justify-between items-center">
                    <span>Seri sản phẩm *</span>
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 transition-colors"
                      onClick={() => setShowScanner(true)}
                    >
                      <Camera size={13} /> Quét mã vạch
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className={`form-input pr-10 font-mono tracking-wider ${serialWarning ? 'border-amber-400 bg-amber-50/20' : ''}`}
                      placeholder="Mẫu: 1858 260 207 *****"
                      value={serialNumber}
                      onChange={e => {
                        const formatted = formatSerialNumber(e.target.value);
                        setSerialNumber(formatted);
                        const clean = formatted.replace(/[^a-zA-Z0-9]/g, '');
                        if (clean.length === 15) {
                          checkSerial(formatted);
                        } else {
                          setSerialInfo(null);
                          setSerialWarning('');
                        }
                      }}
                      onBlur={() => checkSerial(serialNumber)}
                      required
                    />
                    {serialChecking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin">
                        <Loader2 size={16} />
                      </div>
                    )}
                  </div>

                  {serialWarning && (
                    <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-start gap-1.5 leading-normal">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>{serialWarning}</span>
                    </div>
                  )}

                  {serialInfo && (
                    <div className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg leading-normal shadow-xs">
                      <div className="font-bold flex items-center gap-1 mb-1">
                        <CheckCircle size={14} /> Đã khớp thiết bị lắp đặt gốc:
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-emerald-800">
                        <li>Dòng máy: <strong>{serialInfo.products?.join(', ') || 'Chưa rõ'}</strong></li>
                        <li>Khách hàng gốc: <strong>{serialInfo.customerName || 'Chưa rõ'}</strong></li>
                        <li>Ngày lắp đặt: <strong>{new Date(serialInfo.installDate).toLocaleDateString('vi-VN')}</strong></li>
                      </ul>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Khoảng cách di chuyển (km)</label>
                  <input type="number" className="form-input" placeholder="Nhập khoảng cách" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} />
                </div>
                
                <button
                  type="button"
                  className="btn btn-primary w-full mt-6"
                  onClick={() => setStep(2)}
                  disabled={!selectedOrderId || !customerName || !customerPhone || !workType || !canProceedStep1()}
                >
                  Tiếp tục
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 2: Upload ảnh theo slot labels */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-2 text-lg">2. Hình ảnh xác nhận</h3>
            <p className="text-sm text-gray-500 mb-4">
              Loại: <span className="font-semibold text-[#1B3A6B]">{workType}</span> — Cần {getImageSlots(workType).length} ảnh
            </p>

            {isImageConfirmed ? (
              <div className="mb-4">
                <div className="alert alert-success flex items-center gap-2">
                  <CheckCircle size={20} /> Đã xác nhận {imageUrls.length} ảnh!
                </div>
                <div className="flex gap-4 mt-4">
                  <button
                    type="button"
                    className="btn btn-outline flex-1 flex items-center justify-center gap-2"
                    onClick={() => {
                      setIsImageConfirmed(false);
                    }}
                  >
                    Chỉnh sửa ảnh
                  </button>
                  <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(3)}>
                    Tiếp tục
                  </button>
                </div>
              </div>
            ) : (
              <>
                <LabeledImageUploader
                  imageSlots={getImageSlots(workType)}
                  workType={workType}
                  onUploadSuccess={handleUploadSuccess}
                  initialImageUrls={imageUrls}
                />
                <div className="mt-6 flex gap-4">
                  <button type="button" className="btn btn-outline w-full flex items-center justify-center gap-2" onClick={() => setStep(1)}>
                    <ChevronLeft size={16} /> Quay lại
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 3: Ghi chú & Submit */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">3. Xác nhận & Ghi chú</h3>

            {/* Tóm tắt thông tin */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-2">
              <h4 className="font-semibold text-[#1B3A6B] mb-2">Tóm tắt báo cáo</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-500">Khách hàng:</span>
                <span className="font-medium">{customerName}</span>
                <span className="text-gray-500">SĐT:</span>
                <span className="font-medium">{customerPhone}</span>
                <span className="text-gray-500">Địa chỉ:</span>
                <span className="font-medium">{address}, {province}</span>
                <span className="text-gray-500">Loại công việc:</span>
                <span className="font-medium">{workType}</span>
                <span className="text-gray-500">Loại dịch vụ:</span>
                <span className="font-medium">{selectedServices.join(', ')}</span>
                {selectedItems.length > 0 && (
                  <>
                    <span className="text-gray-500">Sản phẩm & Linh kiện:</span>
                    <span className="font-medium">
                      {selectedItems.map(item => `${item.productName} (x${item.quantity})`).join(', ')}
                    </span>
                  </>
                )}
                <span className="text-gray-500">Seri SP:</span>
                <span className="font-medium">{serialNumber}</span>
                {['Bảo hành', 'Sửa chữa'].includes(workType) && (
                  <>
                    <span className="text-gray-500">Nguyên nhân sự cố:</span>
                    <span className="font-medium">
                      {issueType === 'Khác (Nhập chi tiết phía dưới)' ? customIssueType : issueType}
                    </span>
                    <span className="text-gray-500">Cách xử lý:</span>
                    <span className="font-medium">
                      {handlingMethod}
                    </span>
                  </>
                )}
                {needsTechnicalFields(workType) && (
                  <>
                    <span className="text-gray-500">Nguồn nước:</span>
                    <span className="font-medium">{waterSource}</span>
                    <span className="text-gray-500">TDS vào/ra:</span>
                    <span className="font-medium">{tdsIn} / {tdsOut} ppm</span>
                    <span className="text-gray-500">Áp suất:</span>
                    <span className="font-medium">{waterPressure} psi</span>
                  </>
                )}
                {distanceKm && (
                  <>
                    <span className="text-gray-500">Khoảng cách:</span>
                    <span className="font-medium">{distanceKm} km</span>
                  </>
                )}
                {actualAmount && (
                  <>
                    <span className="text-gray-500">Tiền thu thực tế:</span>
                    <span className="font-medium">{Number(actualAmount).toLocaleString('vi-VN')} VNĐ</span>
                  </>
                )}
                <span className="text-gray-500">Số ảnh:</span>
                <span className="font-medium">{imageUrls.length} ảnh</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">KTV ghi chú (nếu có)</label>
              <textarea className="form-textarea" rows={3} placeholder="Ghi chú thêm..." value={notes} onChange={e => setNotes(e.target.value)}></textarea>
            </div>

            <div className="flex gap-4 mt-8">
              <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(2)}>
                <ChevronLeft size={16} /> Quay lại
              </button>
              <button type="submit" className="btn btn-primary flex-1 flex justify-center items-center gap-2" disabled={loading}>
                {loading ? <span className="spinner"></span> : <><Send size={16} /> Hoàn thành công việc</>}
              </button>
            </div>
          </div>
        )}

        {/* Modal Quét Mã Vạch */}
        {showScanner && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setShowScanner(false)}
          >
            <div 
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800 text-sm">Quét mã vạch sản phẩm</h3>
                <button 
                  type="button" 
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                  onClick={() => setShowScanner(false)}
                >
                  Đóng
                </button>
              </div>
              <div className="p-4 flex flex-col items-center justify-center bg-white">
                <div 
                  id="reader" 
                  className="w-full bg-black rounded-lg overflow-hidden border border-gray-100"
                  style={{ minHeight: '220px' }}
                ></div>
                <p className="text-[11px] text-gray-500 mt-3 text-center leading-relaxed">
                  Đưa camera điện thoại song song và căn chỉnh mã vạch vào ô quét hình chữ nhật.
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
