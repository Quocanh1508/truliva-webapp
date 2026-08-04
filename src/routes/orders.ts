import { Router } from 'express';
import { requireAuth, requireCoordinatorOrAdmin } from '../middleware/authSession';
import {
  getOrders,
  createManualOrder,
  exportOrdersExcel,
  getFilterOptions,
  searchCustomers,
  syncOrders,
  bulkAssignOrders,
  bulkCancelOrders,
  getOrderById,
  getOrderAuditLogs,
  callCustomerForOrder,
  rescheduleOrder,
  updateOrder,
  syncSingleOrder
} from '../controllers/orderController';

const router = Router();

router.use(requireAuth);

// Static / Specific sub-path routes (MUST come before /:id)
router.get('/', getOrders);
router.post('/', createManualOrder);
router.get('/export', exportOrdersExcel);
router.get('/filter-options', getFilterOptions);
router.get('/filters-data', getFilterOptions);
router.get('/customers/search', searchCustomers);
router.post('/sync', syncOrders);
router.patch('/bulk/assign', bulkAssignOrders);
router.patch('/bulk/cancel', bulkCancelOrders);

// Parametric routes
router.get('/:id', getOrderById);
router.get('/:id/audit', getOrderAuditLogs);
router.post('/:id/call-customer', callCustomerForOrder);
router.post('/:id/reschedule', rescheduleOrder);
router.put('/:id', updateOrder);
router.patch('/:id', updateOrder);
router.post('/:id/sync', syncSingleOrder);

export default router;
