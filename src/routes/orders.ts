import { Router } from 'express';
import { requireAuth, requireCoordinatorOrAdmin } from '../middleware/authSession';
import {
  getOrders,
  createManualOrder,
  syncOrders,
  getFilterOptions,
  searchCustomers,
  getOrderById,
} from '../controllers/orderController';

const router = Router();

router.use(requireAuth);

router.get('/', getOrders);
router.post('/', createManualOrder);
router.post('/sync', syncOrders);
router.get('/filter-options', getFilterOptions);
router.get('/filters-data', getFilterOptions);
router.get('/customers/search', searchCustomers);
router.get('/:id', getOrderById);

export default router;
