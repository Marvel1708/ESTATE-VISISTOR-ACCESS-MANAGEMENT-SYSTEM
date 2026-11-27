import express from 'express';
import {
  registerResident,
  registerAdmin,
  login,
  sendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
} from '../controllers/authController.js';
import {
  validateRegister,
  validateLogin,
  validateResetPassword,
  validateChangePassword,
} from '../middleware/validation.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: System
 *     description: Server status check
 *   - name: Authentication
 *     description: Registration, login, OTP, and password management
 *   - name: Resident
 *     description: Visitor pass generation, walk-in approvals, and house blocklists
 *   - name: Security Guard
 *     description: Gate pass verification, entry/exit logging, and walk-in visitors
 *   - name: Estate Admin
 *     description: Estate analytics, guard management, blocklists, audit exports, and settings
 */

/**
 * @swagger
 * /:
 *   get:
 *     summary: Check if Express server is running
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is running
 */

/**
 * @swagger
 * /api/auth/register/resident:
 *   post:
 *     summary: Register a new Resident
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phoneNumber, houseNumber, password]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Chidinma Eze
 *               phoneNumber:
 *                 type: string
 *                 example: "08066666666"
 *               houseNumber:
 *                 type: string
 *                 example: House 14
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: Resident registered
 */
router.post('/register/resident', validateRegister, registerResident);

/**
 * @swagger
 * /api/auth/register/admin:
 *   post:
 *     summary: Register a new Estate Admin
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phoneNumber, password, adminCode]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Admin Tunde
 *               phoneNumber:
 *                 type: string
 *                 example: "08077777777"
 *               password:
 *                 type: string
 *                 example: password123
 *               adminCode:
 *                 type: string
 *                 example: ESTATE_ADMIN_2026
 *     responses:
 *       201:
 *         description: Admin registered
 */
router.post('/register/admin', validateRegister, registerAdmin);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user (Resident, Guard, or Admin)
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, password]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08066666666"
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', validateLogin, login);

/**
 * @swagger
 * /api/auth/otp/send:
 *   post:
 *     summary: Send 6-digit password reset OTP
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08066666666"
 *     responses:
 *       200:
 *         description: OTP sent
 */
router.post('/otp/send', sendOtp);

/**
 * @swagger
 * /api/auth/otp/verify:
 *   post:
 *     summary: Verify 6-digit OTP code
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, otpCode]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08066666666"
 *               otpCode:
 *                 type: string
 *                 example: "482910"
 *     responses:
 *       200:
 *         description: OTP verified
 */
router.post('/otp/verify', verifyOtp);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using OTP
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, otpCode, newPassword]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08066666666"
 *               otpCode:
 *                 type: string
 *                 example: "482910"
 *               newPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password reset successful
 */
router.post('/reset-password', validateResetPassword, resetPassword);

/**
 * @swagger
 * /api/auth/change-password:
 *   patch:
 *     summary: Change password for logged-in user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated
 */
router.patch('/change-password', protect, validateChangePassword, changePassword);
/**
 * @swagger
 * /api/resident/dashboard:
 *   get:
 *     summary: Get resident dashboard summary
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resident dashboard retrieved
 */

/**
 * @swagger
 * /api/resident/rules:
 *   get:
 *     summary: View estate visitor rules
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estate rules retrieved
 */

/**
 * @swagger
 * /api/resident/passes:
 *   post:
 *     summary: Generate a new visitor QR pass
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [visitorName, visitorPhone, purpose, visitDateTime]
 *             properties:
 *               visitorName:
 *                 type: string
 *               visitorPhone:
 *                 type: string
 *               purpose:
 *                 type: string
 *               visitDateTime:
 *                 type: string
 *     responses:
 *       201:
 *         description: Visitor pass created
 *   get:
 *     summary: List resident visitor passes
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of visitor passes
 */

/**
 * @swagger
 * /api/resident/passes/{id}/window:
 *   patch:
 *     summary: Update valid time window for a pass
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pass window updated
 */

/**
 * @swagger
 * /api/resident/passes/{id}/cancel:
 *   patch:
 *     summary: Cancel an active visitor pass
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pass cancelled
 */

/**
 * @swagger
 * /api/resident/passes/{id}/decision:
 *   patch:
 *     summary: Approve or reject a walk-in visitor
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Decision recorded
 */

/**
 * @swagger
 * /api/resident/blocked-visitors:
 *   get:
 *     summary: List house-level blocked visitors
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Blocked visitors list
 *   post:
 *     summary: Block a visitor for this house
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Visitor blocked
 */

/**
 * @swagger
 * /api/resident/blocked-visitors/{id}:
 *   delete:
 *     summary: Unblock a house-level visitor
 *     tags: [Resident]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visitor unblocked
 */
/**
 * @swagger
 * /api/guard/verify-pass:
 *   post:
 *     summary: Verify a visitor pass via QR token or 6-character code
 *     tags: [Security Guard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               passCode:
 *                 type: string
 *                 example: K9P4M2
 *               qrToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pass verified
 */

/**
 * @swagger
 * /api/guard/confirm-entry:
 *   post:
 *     summary: Admit verified visitor (ACTIVE to INSIDE)
 *     tags: [Security Guard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [passId]
 *             properties:
 *               passId:
 *                 type: string
 *               gateName:
 *                 type: string
 *                 example: Main Gate
 *     responses:
 *       200:
 *         description: Visitor entry confirmed
 */

/**
 * @swagger
 * /api/guard/checkout/{passId}:
 *   post:
 *     summary: Check out visitor (INSIDE to EXITED)
 *     tags: [Security Guard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: passId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visitor checked out
 */

/**
 * @swagger
 * /api/guard/visitors-inside:
 *   get:
 *     summary: List all visitors currently inside the estate
 *     tags: [Security Guard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of visitors inside
 */

/**
 * @swagger
 * /api/guard/walk-ins:
 *   post:
 *     summary: Log an uninvited walk-in visitor
 *     tags: [Security Guard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [visitorName, visitorPhone, purpose, houseNumber]
 *             properties:
 *               visitorName:
 *                 type: string
 *               visitorPhone:
 *                 type: string
 *               purpose:
 *                 type: string
 *               houseNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Walk-in request logged
 */
/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get estate dashboard KPIs, analytics, and overstay alerts
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users (optional role filter)
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [RESIDENT, GUARD, ADMIN]
 *     responses:
 *       200:
 *         description: List of users
 */

/**
 * @swagger
 * /api/admin/guards:
 *   post:
 *     summary: Create a new Security Guard account
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phoneNumber, password]
 *             properties:
 *               fullName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Security Guard account created
 */

/**
 * @swagger
 * /api/admin/users/{userId}/house:
 *   patch:
 *     summary: Assign or update a Resident house number
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: House number updated
 */

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   delete:
 *     summary: Delete a Resident or Guard account
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted
 */

/**
 * @swagger
 * /api/admin/passes/{id}/cancel:
 *   patch:
 *     summary: Force-cancel any active visitor pass
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pass cancelled
 */

/**
 * @swagger
 * /api/admin/visit-history:
 *   get:
 *     summary: Get paginated gate entry/exit access logs
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Visit history retrieved
 */

/**
 * @swagger
 * /api/admin/visit-history/export:
 *   get:
 *     summary: Download filtered visit logs as CSV
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 */

/**
 * @swagger
 * /api/admin/blocked-visitors:
 *   get:
 *     summary: List estate-wide blocked visitors
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Blocked visitors list
 *   post:
 *     summary: Block a visitor estate-wide
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Visitor blocked
 */

/**
 * @swagger
 * /api/admin/blocked-visitors/{id}:
 *   delete:
 *     summary: Unblock an estate-wide blocked visitor
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visitor unblocked
 */

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: View estate rules and global settings
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estate settings retrieved
 *   put:
 *     summary: Update estate rules and global settings
 *     tags: [Estate Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estate settings updated
 */

export default router;
