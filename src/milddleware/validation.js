// Validates registration inputs before reaching authController
export const validateRegister = (req, res, next) => {
  const { fullName, phoneNumber, password } = req.body;

  if (!fullName || fullName.trim().length < 2) {
    return res.status(400).json({ message: 'Full name must be at least 2 characters.' });
  }

  if (!phoneNumber || phoneNumber.toString().replace(/\D/g, '').length < 10) {
    return res.status(400).json({ message: 'Please enter a valid Nigerian phone number.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  next();
};


// Validates login inputs before reaching authController
export const validateLogin = (req, res, next) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || phoneNumber.toString().replace(/\D/g, '').length < 10) {
    return res.status(400).json({ message: 'Please enter a valid Nigerian phone number.' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Password is required.' });
  }

  next();
};