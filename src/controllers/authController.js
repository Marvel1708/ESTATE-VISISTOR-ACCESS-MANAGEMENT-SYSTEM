import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { getDefaultEstate, normalizePhone } from '../utils/helpers.js';

const createToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// 1. REGISTER (Residents register freely; Admins require the one-time admin secret code)
export const register = async (req, res) => {
  try {
    const { fullName, phoneNumber, email, houseNumber, password, confirmPassword, role, adminCode } = req.body;

    if (!fullName || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Full name, phone number, and password are required.' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const requestedRole = role ? role.toUpperCase() : 'RESIDENT';

    if (requestedRole !== 'RESIDENT' && requestedRole !== 'ADMIN') {
      return res.status(400).json({ message: 'Only Resident or Admin accounts can register here.' });
    }

    // Secret code required ONLY once when creating an Admin account
    if (requestedRole === 'ADMIN') {
      if (!adminCode || adminCode !== process.env.ADMIN_SECRET_CODE) {
        return res.status(403).json({ message: ' A Valid admin secret code is required.' });
      }
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const existingUser = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });

    if (existingUser) {
      return res.status(400).json({ message: 'Phone number already registered.' });
    }

    const estate = await getDefaultEstate();
    let houseId = null;
    const cleanHouse = houseNumber ? houseNumber.trim() : null;

    if (requestedRole === 'RESIDENT' && cleanHouse) {
      const house = await prisma.house.upsert({
        where: { estateId_label: { estateId: estate.id, label: cleanHouse } },
        update: {},
        create: { estateId: estate.id, label: cleanHouse },
      });
      houseId = house.id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        estateId: estate.id,
        houseId,
        fullName: fullName.trim(),
        phoneNumber: normalizedPhone,
        email: email ? email.trim().toLowerCase() : null,
        houseNumber: requestedRole === 'RESIDENT' ? cleanHouse : null,
        password: hashedPassword,
        role: requestedRole,
      },
    });

    res.status(201).json({
      message: 'Account created successfully!',
      token: createToken(newUser),
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        phoneNumber: newUser.phoneNumber,
        houseNumber: newUser.houseNumber,
        role: newUser.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. LOGIN (Works for Resident, Admin, and Guard — no secret code needed)
export const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({ message: 'Phone number and password are required.' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid phone number or password.' });
    }

    res.json({
      message: 'Login successful!',
      token: createToken(user),
      user: {
        id: user.id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        houseNumber: user.houseNumber,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. SEND OTP
export const sendOtp = async (req, res) => {
  try {
    const normalizedPhone = normalizePhone(req.body.phoneNumber);
    const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });

    if (!user) return res.status(404).json({ message: 'No account found with this phone number.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
    });

    res.json({ message: 'OTP generated', devOtp: otp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 4. VERIFY OTP
export const verifyOtp = async (req, res) => {
  try {
    const normalizedPhone = normalizePhone(req.body.phoneNumber);
    const { otpCode } = req.body;

    const user = await prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone, otpCode, otpExpires: { gt: new Date() } },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpires: null },
    });

    res.json({
      message: 'OTP verified!',
      token: createToken(user),
      user: {
        id: user.id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        houseNumber: user.houseNumber,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
