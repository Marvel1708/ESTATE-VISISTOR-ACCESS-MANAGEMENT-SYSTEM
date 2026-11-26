import express from 'express';
import { register, login, sendOtp, verifyOtp, resetPassword, changePassword } from '../controllers/authController.js';
import {
  validateRegister,
  validateLogin,
  validateResetPassword,
  validateChangePassword,
} from '../middleware/validation.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post('/register',  validateRegister, register);
router.post('/login',  validateLogin, login);
router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtp);
router.post('/reset-password', validateResetPassword,resetPassword);
router.patch('/change-password', protect, validateChangePassword,changePassword);
export default router;
