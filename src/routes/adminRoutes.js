import { Router } from 'express';
import { protect, authorize } from '../milddleware/authMiddleware.js';
import * as a from '../controllers/adminController.js';

const router = Router();

router.use(protect, authorize('ADMIN'));

router.get('/dashboard', a.dashboard);

router.get('/history/export', a.exportHistory);
router.get('/history', a.history);

router.route('/blocklist').get(a.listBlocked).post(a.addBlocked);
router.delete('/blocklist/:id', a.removeBlocked);

router.route('/settings').get(a.getSettings).patch(a.updateSettings);

export default router;