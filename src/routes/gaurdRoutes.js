import { Router } from 'express';
import { protect, authorize } from '../milddleware/authMiddleware.js';
import * as g from '../controllers/gaurdController.js';

const router = Router();

router.use(protect, authorize('GUARD'));

router.get('/dashboard', g.dashboard);

router.post('/verify', g.verifyPass);
router.post('/passes/:id/request-permission', g.requestPermission);
router.get('/passes/:id/approval-status', g.getApprovalStatus);
router.post('/entry', g.confirmEntry);

router.post('/exit/:passId', g.logExit);
router.get('/inside', g.visitorsInside);

router.post('/walk-ins', g.createWalkIn);
router.get('/walk-ins/:id', g.getWalkIn);

router.get('/history', g.history);

export default router;