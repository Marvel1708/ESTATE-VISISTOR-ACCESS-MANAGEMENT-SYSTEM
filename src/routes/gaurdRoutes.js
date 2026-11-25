import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import {
  verifyPass,
  requestPermission,
  getApprovalStatus,
  confirmEntry,
  logExit,
  visitorsInside,
  createWalkIn,
} from '../controllers/guardController.js';

const router = express.Router();

// Protect all Guard routes: user must be logged in as GUARD or ADMIN
router.use(protect, authorizeRoles('GUARD', 'ADMIN'));

router.post('/verify-qr', verifyPass);
router.post('/verify-pass', verifyPass);
router.post('/passes/:id/request-permission', requestPermission);
router.get('/passes/:id/approval-status', getApprovalStatus);
router.post('/confirm-entry', confirmEntry);
router.post('/checkout/:passId', logExit);
router.get('/visitors-inside', visitorsInside);
router.post('/walk-ins', createWalkIn);

export default router;
