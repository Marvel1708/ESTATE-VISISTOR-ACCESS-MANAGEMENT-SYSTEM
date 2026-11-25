import express from 'express';
import { register, login, sendOtp, verifyOtp } from '../controllers/authController.js';
import { validateRegister, validateLogin } from '../middleware/validation.js';
const router = express.Router();

router.post('/register', register, validateRegister);
router.post('/login', login, validateLogin);
router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;
