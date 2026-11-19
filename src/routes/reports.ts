import { Router } from 'express';
import { requireAuth, requireCoordinatorOrAdmin, requireDashboardAccess, requirePermission } from '../middleware/authSession';
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
  rejectReport,
  sendReportZnsManual
} from '../controllers/reportController';

const router = Router();

router.use(requireAuth);

router.post('/', createReport);
router.get('/', requirePermission('REPORT_VIEW', 'REPORT_CREATE'), getReports);
router.get('/my-stats', requirePermission('REPORT_CREATE', 'ORDER_VIEW'), getMyStats);
router.get('/filter-options', requirePermission('REPORT_VIEW'), getFilterOptions);
router.get('/stats', requireDashboardAccess, getReportStats);
router.get('/export', requireDashboardAccess, exportReports);
router.get('/check-serial', requirePermission('REPORT_CREATE', 'ORDER_VIEW'), checkReportSerial);
router.get('/:id', requirePermission('REPORT_VIEW', 'REPORT_CREATE'), getReportById);
router.put('/:id', updateReport);
router.delete('/:id', requireCoordinatorOrAdmin, deleteReport);
router.post('/:id/approve', approveReport);
router.post('/:id/reject', rejectReport);
router.post('/:id/send-zns', sendReportZnsManual);

export default router;
