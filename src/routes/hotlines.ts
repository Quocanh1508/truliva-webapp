import { Router } from 'express';
import { requireAuth } from '../middleware/authSession';
import {
  searchCustomerHistory,
  getHotlineTickets,
  getHotlineFilterOptions,
  createHotlineTicket,
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

// Phase 1: Tra cứu lịch sử KH
router.get('/search-customer', searchCustomerHistory);

// Dropdown danh sách người xử lý (HOTLINE/ADMIN/COORDINATOR)
router.get('/handlers', getHotlineHandlers);

// Dữ liệu tùy chọn cho bộ lọc
router.get('/filter-options', getHotlineFilterOptions);

// CRUD
router.get('/', getHotlineTickets);
router.post('/', createHotlineTicket);

// Parametric routes
router.get('/:id', getHotlineTicketById);
router.put('/:id', updateHotlineTicket);
router.delete('/:id', deleteHotlineTicket);

// Thao tác nhanh
router.post('/:id/assign', assignHotlineTicket);
router.post('/:id/convert-to-order', convertToServiceOrder);
router.post('/:id/verify', verifyHotlineTicketPhase3);

export default router;
