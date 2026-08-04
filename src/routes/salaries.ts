import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import {
  getCalculatedSalaries,
  adjustSalary,
  exportSalaries,
  getKtvRates,
  updateKtvRate,
  addCustomCase,
  deleteCustomCase
} from '../controllers/salaryController';

const router = Router();

/**
 * GET /api/salaries/calculate
 * Calculate full salaries for all active KTVs for a given month
 */
router.get('/calculate', requireAuth, requireAdmin, getCalculatedSalaries);

/**
 * POST /api/salaries/adjust
 * Manually adjust a KTV's salary for a specific month
 */
router.post('/adjust', requireAuth, requireAdmin, adjustSalary);

/**
 * GET /api/salaries/export
 * Export salary spreadsheet with unified filtering
 */
router.get('/export', requireAuth, requireAdmin, exportSalaries);

/**
 * GET /api/salaries/rates
 * Fetch matrix of custom service rates for all KTVs
 */
router.get('/rates', requireAuth, requireAdmin, getKtvRates);

/**
 * POST /api/salaries/rates
 * Update single rate entry for a specific KTV
 */
router.post('/rates', requireAuth, requireAdmin, updateKtvRate);

/**
 * POST /api/salaries/add-custom-case
 * Admin adds custom salary case for a KTV
 */
router.post('/add-custom-case', requireAuth, requireAdmin, addCustomCase);

/**
 * DELETE /api/salaries/custom-case/:reportId
 * Delete a custom salary case
 */
router.delete('/custom-case/:reportId', requireAuth, requireAdmin, deleteCustomCase);

export default router;
