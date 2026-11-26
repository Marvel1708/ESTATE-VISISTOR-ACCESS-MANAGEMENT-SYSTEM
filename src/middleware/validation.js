import { body, validationResult } from 'express-validator';

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }
  next();
};

export const validateRegister = [
  body('fullName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters.'),
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((v) => v.toString().replace(/\D/g, '').length >= 10)
    .withMessage('Please provide a valid Nigerian phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('Please provide a valid email.'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long.'),
  validate,
];

export const validateLogin = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((v) => v.toString().replace(/\D/g, '').length >= 10)
    .withMessage('Please provide a valid Nigerian phone number.'),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
  validate,
];

export const validateResetPassword = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required.'),
  body('otpCode')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP code must be 6 digits.'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long.'),
  validate,
];

export const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Please enter your current password.'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long.'),
  validate,
];
