import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

// Gets the single fixed pilot estate (auto-creates on first run)
export const getDefaultEstate = async () => {
  let estate = await prisma.estate.findFirst();
  if (!estate) {
    estate = await prisma.estate.create({
      data: { name: 'Estate Access Pilot Community' },
    });
  }
  return estate;
};

// Normalizes "0803-123 4567" -> "+2348031234567"
export const normalizePhone = (phone) => {
  if (!phone) return '';
  let cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
  
  if (cleaned.startsWith('+234')) return cleaned;
  if (cleaned.startsWith('234') && cleaned.length === 13) return '+' + cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 11) return '+234' + cleaned.slice(1);

  return cleaned;
};

// 6-character uppercase alphanumeric code 
export const generatePassCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(6);

  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
};

// Signs QR payload { passId, code, estateId, validFrom, validTo } with header kid
export const signQrPayload = ({ passId, code, estateId, validFrom, validTo }) => {
  return jwt.sign(
    { passId, code, estateId, validFrom, validTo },
    process.env.JWT_SECRET,
    {
      header: { kid: process.env.JWT_KEY_ID || 'v1' },
      expiresIn: '25h',
    }
  );
};

// Verifies QR payload (supports current key and optional previous key during rotation)
export const verifyQrPayload = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (process.env.JWT_SECRET_PREVIOUS) {
      return jwt.verify(token, process.env.JWT_SECRET_PREVIOUS);
    }
    throw err;
  }
};
