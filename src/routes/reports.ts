import { Router } from 'express';
import { requireAuth, requireCoordinatorOrAdmin, requireDashboardAccess } from '../middleware/authSession';
import {
  createReport,
  getReports,
  getMyStats,
  getFilterOptions,
  getReportStats,
  exportReports,
  checkReportSerial,
  getReportById,
  updateReport,
  deleteReport,
  approveReport,
  rejectReport
} from '../controllers/reportController';

const router = Router();

router.use(requireAuth);

router.post('/', createReport);
router.get('/', getReports);
router.get('/my-stats', getMyStats);
router.get('/filter-options', getFilterOptions);
router.get('/stats', requireDashboardAccess, getReportStats);
router.get('/export', requireDashboardAccess, exportReports);
router.get('/check-serial', checkReportSerial);
router.get('/:id', getReportById);
router.put('/:id', updateReport);
router.delete('/:id', requireCoordinatorOrAdmin, deleteReport);
router.post('/:id/approve', approveReport);
router.post('/:id/reject', rejectReport);

export default router;
