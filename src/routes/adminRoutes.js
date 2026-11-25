import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import {
  dashboard,
  listUsers,
  createGuard,
  assignResidentHouse,
  deleteUser,
  adminCancelPass,
  history,
  exportHistory,
  listBlocked,
  addBlocked,
  removeBlocked,
  getSettings,
  updateSettings,
} from '../controllers/adminController.js';

const router = express.Router();

// Protect all Admin routes: user must be logged in AND have role "ADMIN"
router.use(protect, authorizeRoles('ADMIN'));

router.get('/dashboard', dashboard);
router.get('/users', listUsers);
router.post('/guards', createGuard);
router.patch('/users/:userId/house', assignResidentHouse);
router.delete('/users/:userId', deleteUser);
router.patch('/passes/:id/cancel', adminCancelPass);
router.get('/visit-history', history);
router.get('/visit-history/export', exportHistory);
router.get('/blocked-visitors', listBlocked);
router.post('/blocked-visitors', addBlocked);
router.delete('/blocked-visitors/:id', removeBlocked);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;
