import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import {
  getCalculatedSalaries,
  adjustSalary,
  exportSalaries,
  getKtvRates,
  updateKtvRate,
  resetKtvRates,
  updateBaseCost,
  addCustomCase,
  deleteCustomCase
} from '../controllers/salaryController';

const router = Router();

router.use(requireAuth);

router.get('/calculate', requireAdmin, getCalculatedSalaries);
router.post('/adjust', requireAdmin, adjustSalary);
router.get('/export', requireAdmin, exportSalaries);
router.get('/rates', requireAdmin, getKtvRates);
router.post('/rates', requireAdmin, updateKtvRate);
router.delete('/rates/:userId', requireAdmin, resetKtvRates);
router.post('/update-base-cost', requireAdmin, updateBaseCost);
router.post('/add-custom-case', requireAdmin, addCustomCase);
router.delete('/custom-case/:reportId', requireAdmin, deleteCustomCase);

export default router;
