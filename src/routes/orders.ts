import { Router } from 'express';
import { requireAuth, requireCoordinatorOrAdmin, requirePermission } from '../middleware/authSession';
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
router.get('/', requirePermission('ORDER_VIEW', 'REPORT_CREATE'), getOrders);
router.post('/', createManualOrder);
router.get('/export', requirePermission('ORDER_EXPORT_EXCEL'), exportOrdersExcel);
router.get('/filter-options', requirePermission('ORDER_VIEW', 'REPORT_CREATE'), getFilterOptions);
router.get('/filters-data', requirePermission('ORDER_VIEW', 'REPORT_CREATE'), getFilterOptions);
router.get('/customers/search', requirePermission('ORDER_VIEW', 'ORDER_CREATE'), searchCustomers);
router.post('/sync', syncOrders);
router.patch('/bulk/assign', bulkAssignOrders);
router.patch('/bulk/cancel', bulkCancelOrders);

// Parametric routes
router.get('/:id', requirePermission('ORDER_VIEW', 'REPORT_CREATE'), getOrderById);
router.get('/:id/audit', requirePermission('ORDER_AUDIT_LOG'), getOrderAuditLogs);
router.post('/:id/call-customer', callCustomerForOrder);
router.post('/:id/reschedule', rescheduleOrder);
router.put('/:id', updateOrder);
router.patch('/:id', updateOrder);
router.post('/:id/sync', syncSingleOrder);

export default router;
