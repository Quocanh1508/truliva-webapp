import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/authSession';
import { legacyHistoryWriteLimiter } from '../middleware/rateLimiter';
import {
  searchCustomerHistory,
  createLegacyServiceHistory,
  getHotlineTickets,
  getHotlineFilterOptions,
  createHotlineTicket,
  exportHotlineTickets,
  getHotlineTicketById,
  updateHotlineTicket,
  assignHotlineTicket,
  convertToServiceOrder,
  verifyHotlineTicketPhase3,
  deleteHotlineTicket,
  getHotlineHandlers,
  createPublicTechSupportTicket,
  getPublicSupportDevices
} from '../controllers/hotlineController';

const router = Router();

// Public Routes (Không cần đăng nhập)
router.post('/public/create-support', createPublicTechSupportTicket);
router.get('/public/devices', getPublicSupportDevices);

router.use(requireAuth);

// Phase 1: Tra cứu lịch sử KH & Gợi ý SĐT
router.get('/search-customer', requirePermission('HOTLINE_SEARCH_CUSTOMER', 'HOTLINE_TICKET_CREATE', 'HOTLINE_TICKET_VIEW'), searchCustomerHistory);

// Nhập thủ công lịch sử dịch vụ khách hàng (bảng legacy_service_histories, không ghi vào orders)
router.post('/legacy-history', legacyHistoryWriteLimiter, requirePermission('HOTLINE_LEGACY_HISTORY_CREATE'), createLegacyServiceHistory);

// Dropdown danh sách người xử lý (HOTLINE/ADMIN/COORDINATOR)
router.get('/handlers', requirePermission('HOTLINE_TICKET_VIEW', 'HOTLINE_TICKET_CREATE'), getHotlineHandlers);

// Dữ liệu tùy chọn cho bộ lọc
router.get('/filter-options', requirePermission('HOTLINE_TICKET_VIEW'), getHotlineFilterOptions);

// CRUD & Export
router.get('/export', requirePermission('HOTLINE_EXPORT_EXCEL'), exportHotlineTickets);
router.get('/', requirePermission('HOTLINE_TICKET_VIEW'), getHotlineTickets);
router.post('/', createHotlineTicket);

// Parametric routes
router.get('/:id', requirePermission('HOTLINE_TICKET_VIEW'), getHotlineTicketById);
router.put('/:id', updateHotlineTicket);
router.delete('/:id', deleteHotlineTicket);

// Thao tác nhanh
router.post('/:id/assign', assignHotlineTicket);
router.post('/:id/convert-to-order', convertToServiceOrder);
router.post('/:id/verify', verifyHotlineTicketPhase3);

export default router;
