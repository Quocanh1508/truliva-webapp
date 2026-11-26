// Danh mục Hướng dẫn sử dụng WebApp (Enterprise Guide).
// Mỗi bước trỏ tới phần tử có thuộc tính data-tour="<target>".
// Hệ thống tự động lọc nghiêm ngặt theo Ma trận phân quyền (Role / Group / User Override)
// để tuyệt đối không hiển thị hướng dẫn của chức năng mà tài khoản không có quyền sử dụng.

export interface GuideAccessContext {
  role?: string;
  group?: string | null;
  hasPermission: (key: string) => boolean;
}

export type GuideIconKey =
  | 'assign'
  | 'edit'
  | 'sync-single'
  | 'report'
  | 'copy'
  | 'cancel'
  | 'reopen'
  | 'view-report'
  | 'audit';

export interface GuideButtonPreview {
  icon: GuideIconKey;
  label: string;
  /** Giải thích điều kiện nút xuất hiện (khi dùng fallback) */
  conditionNote?: string;
}

export interface WebGuideStep {
  target: string;
  route: string;
  title: string;
  text: string | ((ctx: GuideAccessContext) => string);
  /** Các bước thực hiện theo trình tự (SOP flow) */
  flow?: string[] | ((ctx: GuideAccessContext) => string[]);
  tip?: string | ((ctx: GuideAccessContext) => string | undefined);
  /** Hiển thị trực quan đúng icon nút trong thẻ hướng dẫn để người dùng nhận diện ngay */
  buttonPreview?: GuideButtonPreview;
  /**
   * Nếu không tìm thấy `target` trên trang hiện tại (vd. trang 1 chưa có ca tự tạo),
   * tự động khoét sáng vùng chứa `fallbackTarget` (vd. cột Thao tác `orders-row-actions`)
   * để người dùng biết chính xác nút đó sẽ xuất hiện ở đâu.
   */
  fallbackTarget?: string;
  /** Nếu true và không có cả target lẫn fallbackTarget, vẫn hiện thẻ ở giữa màn hình */
  fallbackCenter?: boolean;
  /** Quyền bắt buộc trong Ma trận phân quyền */
  requiredPermission?: string;
  /** Giới hạn thêm theo Role (khi UI ràng buộc cứng theo role) */
  allowedRoles?: string[];
  /** Điều kiện tùy chỉnh bổ sung */
  canAccess?: (ctx: GuideAccessContext) => boolean;
}

export interface ResolvedWebGuideStep {
  target: string;
  route: string;
  title: string;
  text: string;
  flow?: string[];
  tip?: string;
  buttonPreview?: GuideButtonPreview;
  fallbackTarget?: string;
  fallbackCenter?: boolean;
}

export interface WebGuideTopic {
  id: string;
  route: string;
  moduleLabel: string;
  title: string;
  desc: string;
  requiredPermission?: string;
  allowedRoles?: string[];
  steps: WebGuideStep[];
}

export interface ResolvedWebGuideTopic {
  id: string;
  route: string;
  moduleLabel: string;
  title: string;
  desc: string;
  steps: ResolvedWebGuideStep[];
}

const isNotViewOnlyStaff = (ctx: GuideAccessContext) =>
  !(ctx.role === 'STAFF' && ctx.group === 'Service');

function isStepAllowed(step: WebGuideStep, ctx: GuideAccessContext): boolean {
  if (step.requiredPermission && !ctx.hasPermission(step.requiredPermission)) {
    return false;
  }
  if (step.allowedRoles && (!ctx.role || !step.allowedRoles.includes(ctx.role))) {
    return false;
  }
  if (step.canAccess && !step.canAccess(ctx)) {
    return false;
  }
  return true;
}

const ORDER_STEPS = {
  // ── Nhóm 1: Tổng quan, Tìm kiếm & Bộ lọc ──
  stats: {
    target: 'orders-stats',
    route: '/admin/orders',
    title: 'Thanh thống kê 6 trạng thái ca dịch vụ',
    text: 'Tổng hợp tức thì số lượng ca theo từng giai đoạn xử lý (khớp với bộ lọc hiện tại) để điều phối viên nắm tải công việc trong ngày.',
    flow: [
      'Chờ xử lý (vàng): Ca mới tạo hoặc vừa đồng bộ từ Pancake POS, chưa gán KTV.',
      'Đã phân công (xanh dương): Đã gán Trạm/KTV và đang chờ thi công.',
      'Hoàn thành (xanh lá): KTV hoặc nhân sự đã nộp báo cáo nghiệm thu hoàn tất.',
      'Hoàn/Đổi (tím) & Hủy đơn (đỏ): Các ca phát sinh đổi trả hoặc đã hủy có lý do.',
    ],
    requiredPermission: 'ORDER_VIEW',
  },
  search: {
    target: 'orders-search',
    route: '/admin/orders',
    title: 'Ô Tìm kiếm nhanh ca dịch vụ',
    text: 'Tra cứu nhanh bất kỳ ca dịch vụ nào mà không cần mở bộ lọc nâng cao.',
    flow: [
      'Nhập Mã đơn (VD: 12345 hoặc #M102), Tên khách hàng hoặc Số điện thoại vào ô.',
      'Dừng gõ khoảng 0.4 giây (hoặc nhấn Enter) để hệ thống tự động tải kết quả khớp.',
      'Nhấn biểu tượng dấu X ở cuối ô để xóa từ khóa và quay về danh sách ban đầu.',
    ],
    requiredPermission: 'ORDER_VIEW',
  },
  filter: {
    target: 'orders-filter',
    route: '/admin/orders',
    title: 'Nút Lọc — Bộ lọc nâng cao 13 tiêu chí',
    text: 'Kết hợp đồng thời nhiều điều kiện để khoanh vùng đúng nhóm ca cần xử lý hoặc đối soát.',
    flow: [
      'Nhấn nút "Lọc" để mở danh sách 13 tiêu chí (Trạng thái, Loại CV, Loại dịch vụ, Sản phẩm, Trạm chính/KT, KTV, Tỉnh/TP, Người tạo và 4 mốc thời gian).',
      'Chọn 1 tiêu chí → tích chọn các giá trị mong muốn → nhấn "Áp dụng".',
      'Có thể lặp lại để ghép nhiều điều kiện; các thẻ bộ lọc đang bật hiện ngay dưới thanh công cụ (bấm X trên từng thẻ hoặc "Xóa tất cả" để gỡ).',
    ],
    tip: 'Khi có ít nhất 1 bộ lọc đang bật, chấm tròn xanh dương sẽ xuất hiện ngay trên nút Lọc.',
    requiredPermission: 'ORDER_VIEW',
  },
  autoRefresh: {
    target: 'orders-autorefresh',
    route: '/admin/orders',
    title: 'Nút Đồng bộ Real-time (WebSocket)',
    text: 'Giữ màn hình luôn cập nhật theo thời gian thực mà không cần bấm F5 tải lại trang.',
    flow: [
      'Trạng thái xanh lá ("Đồng bộ Real-time"): Kết nối WebSocket đang hoạt động, đơn mới/thay đổi cập nhật tức thì.',
      'Trạng thái vàng ("Tự động làm mới 5s"): Tự động chuyển sang chế độ làm mới định kỳ khi mạng chập chờn.',
      'Nhấn trực tiếp vào nút để tạm tắt khi bạn cần giữ cố định danh sách để đối chiếu dữ liệu.',
    ],
    requiredPermission: 'ORDER_AUTO_REFRESH',
  },

  // ── Nhóm 2: Tạo ca thủ công, Đồng bộ POS & Xuất Excel ──
  create: {
    target: 'orders-create',
    route: '/admin/orders',
    title: 'Nút "Tạo ca dịch vụ" (Tạo ca thủ công)',
    text: 'Dùng khi cần lập ca dịch vụ trực tiếp trên Truliva (bảo hành, sửa chữa, thay lõi, lắp đặt ngoài POS) mà không có đơn từ Pancake POS.',
    flow: [
      'Nhấn "Tạo ca dịch vụ" để mở biểu mẫu khởi tạo.',
      'Nhập SĐT khách hàng (hệ thống tự gợi ý thông tin KH cũ nếu đã từng giao dịch), Họ tên, Địa chỉ chi tiết và Tỉnh/Thành phố.',
      'Chọn Loại công việc, Loại dịch vụ chi tiết, Sản phẩm/Combo, Số tiền thu hộ (nếu có) và Ghi chú.',
      'Nhấn Lưu → Hệ thống tạo ca mới (mã tự tạo) ở trạng thái "Chờ xử lý" và hiển thị ngay trên đầu danh sách.',
    ],
    requiredPermission: 'ORDER_CREATE',
  },
  sync: {
    target: 'orders-sync',
    route: '/admin/orders',
    title: 'Nút "Đồng bộ Pancake" (Kéo 50 đơn mới nhất)',
    text: 'Chủ động kéo ngay 50 đơn hàng mới nhất từ hệ thống Pancake POS về Truliva thay vì chờ lịch tự động.',
    flow: [
      'Nhấn "Đồng bộ Pancake" khi vừa chốt đơn gấp trên POS và cần phân công KTV ngay.',
      'Hệ thống tự đối chiếu: đơn mới sẽ được thêm vào trạng thái "Chờ xử lý", đơn cũ được cập nhật thông tin mới nhất mà không làm mất KTV đã phân công.',
    ],
    requiredPermission: 'ORDER_SYNC_PANCAKE',
  },
  exportExcel: {
    target: 'orders-export',
    route: '/admin/orders',
    title: 'Nút "Xuất Excel" danh sách ca dịch vụ',
    text: 'Xuất dữ liệu ca dịch vụ ra file bảng tính (.xlsx) phục vụ báo cáo, đối soát hoặc gửi đối tác.',
    flow: [
      'Áp dụng sẵn Bộ lọc (thời gian, trạng thái, trạm, KTV...) hoặc ô Tìm kiếm để giới hạn đúng tập dữ liệu cần lấy.',
      'Nhấn "Xuất Excel" → Hệ thống tạo và tải trực tiếp file .xlsx khớp 100% với bộ lọc đang chọn.',
    ],
    requiredPermission: 'ORDER_EXPORT_EXCEL',
  },

  // ── Nhóm 3: Điều phối, Phân công KTV & Sửa ca ──
  actionAssign: {
    target: 'orders-action-assign',
    route: '/admin/orders',
    title: 'Nút Phân loại & Phân công (biểu tượng người +)',
    text: (ctx) =>
      ctx.hasPermission('ORDER_ASSIGN_KTV')
        ? 'Nút nghiệp vụ quan trọng nhất của Điều phối viên: dùng để phân loại dịch vụ, chọn kho xuất hàng, hẹn lịch khách và giao ca cho KTV.'
        : 'Mở cửa sổ chi tiết yêu cầu để xem đầy đủ thông tin đơn và bổ sung/điều chỉnh phân loại dịch vụ, sản phẩm trước khi điều phối.',
    flow: (ctx) =>
      ctx.hasPermission('ORDER_ASSIGN_KTV')
        ? [
            'Nhấn biểu tượng người (+) trên dòng ca cần xử lý để mở cửa sổ "Chi tiết & Phân bổ".',
            'Cột trái: Kiểm tra/chỉnh Loại công việc, Loại dịch vụ chi tiết, Sản phẩm và Ghi chú cho KTV.',
            'Cột phải: Chọn Trạm chính → Trạm kỹ thuật → Kỹ thuật viên phụ trách, chọn Kho xuất hàng và Thời gian hẹn khách.',
            'Nhấn "Lưu thông tin & Phân bổ" → Ca tự chuyển sang "Đang thực hiện", bắn thông báo đẩy (Push) sang app KTV và đồng bộ kho/trạng thái ngược về Pancake POS.',
          ]
        : [
            'Nhấn biểu tượng người (+) trên dòng ca để mở cửa sổ chi tiết.',
            'Kiểm tra hoặc cập nhật Loại công việc, Loại dịch vụ, Sản phẩm và Ghi chú cho bộ phận Điều phối.',
            'Nhấn Lưu để cập nhật thông tin (tài khoản của bạn không thay đổi Trạm/KTV được gán).',
          ],
    buttonPreview: {
      icon: 'assign',
      label: 'Phân loại & Phân công',
    },
    fallbackTarget: 'orders-row-actions',
    requiredPermission: 'ORDER_VIEW',
    canAccess: isNotViewOnlyStaff,
  },
  selectAll: {
    target: 'orders-select-all',
    route: '/admin/orders',
    title: 'Ô tích chọn nhiều ca (Phân bổ / Hủy hàng loạt)',
    text: 'Xử lý nhanh nhiều ca dịch vụ cùng lúc thay vì mở từng dòng đơn lẻ.',
    flow: [
      'Tích chọn ô đầu bảng (chọn toàn bộ trang) hoặc tích riêng từng dòng cần xử lý.',
      'Thanh thao tác màu tối sẽ hiện ở cạnh dưới màn hình kèm số lượng đơn đã chọn.',
      'Chọn "Phân bổ hàng loạt" để gán chung 1 Trạm/KTV/Lịch hẹn cho tất cả đơn đã chọn, hoặc "Hủy hàng loạt" nếu cần hủy nhiều đơn trùng/lỗi.',
    ],
    requiredPermission: 'ORDER_ASSIGN_KTV',
    allowedRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
  },
  actionEdit: {
    target: 'orders-action-edit',
    route: '/admin/orders',
    title: 'Nút Chỉnh sửa ca tự tạo',
    text: 'Cho phép sửa lại thông tin gốc của các ca được tạo thủ công trên Truliva (không áp dụng cho đơn đồng bộ từ Pancake POS).',
    flow: [
      'Nút xuất hiện trong cột Thao tác ở các dòng ca tự tạo thủ công.',
      'Nhấn biểu tượng bút vàng → Cập nhật Tên/SĐT/Địa chỉ khách, Sản phẩm, Tiền thu COD hoặc Ghi chú.',
      'Nhấn Lưu → Hệ thống cập nhật ca và tự động lưu vết thay đổi vào Nhật ký lịch sử.',
    ],
    buttonPreview: {
      icon: 'edit',
      label: 'Chỉnh sửa ca tự tạo',
      conditionNote: 'Nút bút vàng xuất hiện tại cột Thao tác (vùng khoét sáng) đối với các ca tự tạo thủ công. Trang hiện tại đang hiển thị toàn đơn Pancake POS.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'ORDER_EDIT_MANUAL',
    canAccess: isNotViewOnlyStaff,
  },
  actionSyncSingle: {
    target: 'orders-action-sync-single',
    route: '/admin/orders',
    title: 'Nút Đồng bộ đơn lẻ từ Pancake',
    text: 'Kéo riêng dữ liệu mới nhất của đúng 1 đơn hàng từ Pancake POS về Truliva.',
    flow: [
      'Nút chỉ xuất hiện trên các đơn có nguồn từ Pancake POS.',
      'Dùng khi Sale/CSKH vừa sửa địa chỉ, SĐT, sản phẩm hoặc tiền thu hộ trên Pancake và cần cập nhật tức thì cho đúng ca này.',
      'Nhấn nút → Hệ thống gọi trực tiếp POS và làm mới dữ liệu của dòng đơn đó sau 1–2 giây.',
    ],
    buttonPreview: {
      icon: 'sync-single',
      label: 'Đồng bộ lại từ Pancake',
      conditionNote: 'Nút xoay xanh xuất hiện tại cột Thao tác đối với các đơn đồng bộ từ Pancake POS.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'ORDER_SYNC_SINGLE',
    canAccess: isNotViewOnlyStaff,
  },

  // ── Nhóm 4: Báo cáo hoàn thành, Hủy đơn & Mở lại đơn ──
  actionReport: {
    target: 'orders-action-report',
    route: '/admin/orders',
    title: 'Nút Báo cáo hoàn thành ca',
    text: 'Cho phép Admin/Điều phối/Saler lập báo cáo nghiệm thu hoàn thành hộ KTV (hoặc cho các ca tự giao/hỗ trợ trực tiếp).',
    flow: [
      'Nút xuất hiện ở các ca đang ở trạng thái Chờ xử lý / Đang thực hiện.',
      'Nhấn biểu tượng clipboard xanh lá → Hệ thống chuyển sang màn hình Tạo báo cáo và điền sẵn toàn bộ thông tin đơn hàng.',
      'Nhập số Serial máy, ảnh nghiệm thu, linh kiện thay thế, tiền thu thực tế → Nhấn Nộp báo cáo.',
      'Sau khi nộp/duyệt, ca tự chuyển sang "Hoàn thành", ghi nhận công KTV và kích hoạt luồng bảo hành/ZNS (nếu có).',
    ],
    buttonPreview: {
      icon: 'report',
      label: 'Báo cáo hoàn thành ca',
      conditionNote: 'Nút clipboard xanh lá xuất hiện tại cột Thao tác đối với các ca chưa hoàn thành/chưa hủy.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'ORDER_COMPLETE_MANUAL',
    allowedRoles: ['ADMIN', 'COORDINATOR', 'DEV', 'SALER'],
    canAccess: isNotViewOnlyStaff,
  },
  actionCancel: {
    target: 'orders-action-cancel',
    route: '/admin/orders',
    title: 'Nút Hủy đơn hàng',
    text: 'Chuyển ca dịch vụ sang trạng thái "Hủy đơn" khi khách hủy lịch hoặc đơn tạo nhầm (hệ thống không xóa vật lý dữ liệu).',
    flow: [
      'Nhấn biểu tượng dấu X đỏ trên dòng ca chưa hoàn thành.',
      'Nhập bắt buộc Lý do hủy đơn vào hộp thoại xác nhận.',
      'Xác nhận → Trạng thái chuyển sang "Hủy đơn", lý do hủy hiện nổi bật trên dòng, hệ thống ghi AuditLog và hoàn trả tồn kho liên quan.',
    ],
    tip: 'Dữ liệu đơn hủy vẫn được lưu vĩnh viễn để đối soát và có thể Mở lại nếu cần.',
    buttonPreview: {
      icon: 'cancel',
      label: 'Hủy đơn hàng',
      conditionNote: 'Nút dấu X đỏ xuất hiện tại cột Thao tác đối với các ca chưa hoàn thành/chưa hủy.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'ORDER_CANCEL',
    canAccess: isNotViewOnlyStaff,
  },
  actionReopen: {
    target: 'orders-action-reopen',
    route: '/admin/orders',
    title: 'Nút Mở lại đơn',
    text: 'Khôi phục một ca đã "Hoàn thành" hoặc "Hủy đơn" quay trở lại quy trình điều phối mới.',
    flow: [
      'Nút chỉ xuất hiện trên các ca đang ở trạng thái "Hoàn thành" hoặc "Hủy đơn".',
      'Nhấn biểu tượng mũi tên quay lại màu vàng → Đọc kỹ hộp thoại xác nhận.',
      'Xác nhận → Ca quay về trạng thái "Chờ xử lý", gỡ bỏ thông tin phân bổ Trạm/KTV cũ để bạn gán lại từ đầu (mọi báo cáo KTV cũ vẫn được bảo toàn, không bị xóa).',
    ],
    buttonPreview: {
      icon: 'reopen',
      label: 'Mở lại đơn',
      conditionNote: 'Nút mũi tên vàng xuất hiện tại cột Thao tác (vùng khoét sáng) đối với các ca đã Hoàn thành hoặc Hủy đơn.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'ORDER_REOPEN',
    canAccess: isNotViewOnlyStaff,
  },

  // ── Nhóm 5: Tiện ích Tra cứu, Copy Zalo & Nhật ký ──
  actionCopy: {
    target: 'orders-action-copy',
    route: '/admin/orders',
    title: 'Nút Copy thông tin gửi Zalo',
    text: 'Sao chép nhanh toàn bộ thông tin ca dịch vụ theo mẫu chuẩn chỉ với 1 lần nhấn.',
    flow: [
      'Nhấn biểu tượng sao chép tím trên dòng ca cần gửi.',
      'Hệ thống tự định dạng sẵn: Mã đơn, Tên + SĐT + Địa chỉ khách, Loại công việc, Sản phẩm, Tiền thu hộ và Ghi chú vào bộ nhớ tạm.',
      'Dán (Ctrl+V) trực tiếp vào nhóm Zalo Trạm hoặc nhắn riêng cho KTV.',
    ],
    buttonPreview: {
      icon: 'copy',
      label: 'Copy thông tin',
    },
    fallbackTarget: 'orders-row-actions',
    requiredPermission: 'ORDER_VIEW',
  },
  actionViewReport: {
    target: 'orders-action-view-report',
    route: '/admin/orders',
    title: 'Nút Xem báo cáo KTV',
    text: 'Mở nhanh hồ sơ nghiệm thu do KTV đã nộp cho chính ca dịch vụ này.',
    flow: [
      'Nút tự động xuất hiện ngay khi ca dịch vụ có ít nhất 1 báo cáo nghiệm thu.',
      'Nhấn vào nút → Chuyển thẳng sang màn hình "Danh sách báo cáo" đã lọc sẵn đúng mã đơn để kiểm tra ảnh lắp đặt, số serial, chỉ số TDS và duyệt báo cáo.',
    ],
    buttonPreview: {
      icon: 'view-report',
      label: 'Xem báo cáo của KTV',
      conditionNote: 'Nút tài liệu xanh ngọc xuất hiện tại cột Thao tác (vùng khoét sáng) khi đơn đã có báo cáo nghiệm thu từ KTV.',
    },
    fallbackTarget: 'orders-row-actions',
    fallbackCenter: true,
    requiredPermission: 'REPORT_VIEW',
  },
  actionAudit: {
    target: 'orders-action-audit',
    route: '/admin/orders',
    title: 'Nút Nhật ký lịch sử thay đổi',
    text: 'Tra cứu toàn bộ dấu vết thao tác trên ca dịch vụ để phục vụ kiểm tra, đối soát khi có sai lệch.',
    flow: [
      'Nhấn biểu tượng đồng hồ xám trên bất kỳ dòng đơn nào.',
      'Xem dòng thời gian chi tiết: ai tạo đơn, ai đổi trạng thái, phân công/đổi KTV, sửa ghi chú, hủy hay mở lại đơn vào chính xác thời điểm nào.',
    ],
    buttonPreview: {
      icon: 'audit',
      label: 'Lịch sử thay đổi đơn',
    },
    fallbackTarget: 'orders-row-actions',
    requiredPermission: 'ORDER_AUDIT_LOG',
  },
} satisfies Record<string, WebGuideStep>;

export const WEB_GUIDE_TOPICS: WebGuideTopic[] = [
  {
    id: 'orders-overview',
    route: '/admin/orders',
    moduleLabel: 'Quản lý dịch vụ',
    title: '1. Tổng quan, Tìm kiếm & Bộ lọc ca',
    desc: 'Ý nghĩa 6 trạng thái ca, cách tìm nhanh, ghép 13 tiêu chí lọc và bật/tắt đồng bộ Real-time',
    requiredPermission: 'ORDER_VIEW',
    steps: [
      ORDER_STEPS.stats,
      ORDER_STEPS.search,
      ORDER_STEPS.filter,
      ORDER_STEPS.autoRefresh,
    ],
  },
  {
    id: 'orders-create-sync',
    route: '/admin/orders',
    moduleLabel: 'Quản lý dịch vụ',
    title: '2. Tạo ca thủ công, Đồng bộ POS & Xuất Excel',
    desc: 'Quy trình lập ca ngoài POS, kéo 50 đơn mới nhất từ Pancake và xuất file Excel theo bộ lọc',
    requiredPermission: 'ORDER_VIEW',
    steps: [
      ORDER_STEPS.create,
      ORDER_STEPS.sync,
      ORDER_STEPS.exportExcel,
    ],
  },
  {
    id: 'orders-dispatch-flow',
    route: '/admin/orders',
    moduleLabel: 'Quản lý dịch vụ',
    title: '3. Phân loại, Phân công KTV & Sửa ca',
    desc: 'Chi tiết từng nút: Phân công KTV, chọn hàng loạt, chỉnh sửa ca tự tạo và đồng bộ đơn lẻ từ POS',
    requiredPermission: 'ORDER_VIEW',
    steps: [
      ORDER_STEPS.actionAssign,
      ORDER_STEPS.selectAll,
      ORDER_STEPS.actionEdit,
      ORDER_STEPS.actionSyncSingle,
    ],
  },
  {
    id: 'orders-complete-cancel',
    route: '/admin/orders',
    moduleLabel: 'Quản lý dịch vụ',
    title: '4. Báo cáo hoàn thành, Hủy đơn & Mở lại đơn',
    desc: 'Luồng báo cáo hoàn thành hộ KTV, quy trình hủy đơn có lý do/hoàn kho và mở lại ca đã đóng',
    requiredPermission: 'ORDER_VIEW',
    steps: [
      ORDER_STEPS.actionReport,
      ORDER_STEPS.actionCancel,
      ORDER_STEPS.actionReopen,
    ],
  },
  {
    id: 'orders-tracking-tools',
    route: '/admin/orders',
    moduleLabel: 'Quản lý dịch vụ',
    title: '5. Copy gửi Zalo, Xem báo cáo KTV & Nhật ký đơn',
    desc: 'Các công cụ hỗ trợ trao đổi nhanh qua Zalo, xem ảnh nghiệm thu và đối soát lịch sử thao tác',
    requiredPermission: 'ORDER_VIEW',
    steps: [
      ORDER_STEPS.actionCopy,
      ORDER_STEPS.actionViewReport,
      ORDER_STEPS.actionAudit,
    ],
  },
];

/** Nguồn lọc duy nhất: chỉ trả về các chủ đề & bước mà user thực sự có quyền */
export function getAvailableGuideTopics(ctx: GuideAccessContext): ResolvedWebGuideTopic[] {
  const result: ResolvedWebGuideTopic[] = [];
  for (const topic of WEB_GUIDE_TOPICS) {
    if (topic.requiredPermission && !ctx.hasPermission(topic.requiredPermission)) continue;
    if (topic.allowedRoles && (!ctx.role || !topic.allowedRoles.includes(ctx.role))) continue;

    const resolvedSteps: ResolvedWebGuideStep[] = [];
    for (const step of topic.steps) {
      if (!isStepAllowed(step, ctx)) continue;
      const resolvedFlow = typeof step.flow === 'function' ? step.flow(ctx) : step.flow;
      const resolvedTip = typeof step.tip === 'function' ? step.tip(ctx) : step.tip;
      resolvedSteps.push({
        target: step.target,
        route: step.route,
        title: step.title,
        text: typeof step.text === 'function' ? step.text(ctx) : step.text,
        flow: resolvedFlow && resolvedFlow.length > 0 ? resolvedFlow : undefined,
        tip: resolvedTip,
        buttonPreview: step.buttonPreview,
        fallbackTarget: step.fallbackTarget,
        fallbackCenter: step.fallbackCenter,
      });
    }

    if (resolvedSteps.length > 0) {
      result.push({
        id: topic.id,
        route: topic.route,
        moduleLabel: topic.moduleLabel,
        title: topic.title,
        desc: topic.desc,
        steps: resolvedSteps,
      });
    }
  }
  return result;
}

/** Toàn bộ các bước hợp lệ của một route (dùng cho nút "Xem toàn bộ hướng dẫn trang này") */
export function getFullTourStepsForRoute(
  route: string,
  ctx: GuideAccessContext
): ResolvedWebGuideStep[] {
  const topics = getAvailableGuideTopics(ctx).filter((t) => t.route === route);
  const seen = new Set<string>();
  const steps: ResolvedWebGuideStep[] = [];
  for (const topic of topics) {
    for (const step of topic.steps) {
      const key = `${step.route}::${step.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        steps.push(step);
      }
    }
  }
  return steps;
}
