import crypto from 'crypto';
import prisma from '../config/db.js';

const TZ = 'Africa/Lagos';
const WALKIN_TTL_MINUTES = 10;

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const startOfTodayLagos = () => new Date(`${dayKey(new Date())}T00:00:00+01:00`);

const normPhone = (p = '') => {
  let d = String(p).replace(/\D/g, '');
  if (d.startsWith('234')) d = '0' + d.slice(3);
  if (d.length === 10) d = '0' + d;
  return d;
};
const phoneVariants = (p) => {
  const local = normPhone(p);
  if (!local) return [];
  const intl = '234' + local.slice(1);
  return [local, intl, '+' + intl];
};
const last10 = (p = '') => String(p).replace(/\D/g, '').slice(-10);

const isBlocked = (phone) => {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  return prisma.blockedVisitor.findFirst({ where: { phoneNumber: { in: variants } } });
};

const getSettings = () =>
  prisma.estateSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

const extractToken = (raw) => {
  const s = String(raw || '').trim();
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      return String(o.qrToken || o.token || o.code || '').trim();
    } catch {
      return '';
    }
  }
  return s;
};

const notify = (req, userId, event, payload) => {
  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

const evaluatePass = async (pass) => {
  if (await isBlocked(pass.visitorPhone)) return 'blocked';
  switch (pass.status) {
    case 'INSIDE': return 'already_inside';
    case 'EXITED': return 'used';
    case 'REJECTED': return 'rejected';
    case 'EXPIRED': return 'expired';
    default: break;
  }
  if (pass.expiresAt < new Date()) {
    await prisma.visitorPass.updateMany({
      where: { id: pass.id, status: { in: ['ACTIVE', 'PENDING'] } },
      data: { status: 'EXPIRED' },
    });
    return 'expired';
  }
  return null;
};

const residentSelect = { id: true, fullName: true, phoneNumber: true, houseNumber: true };

const passView = (p) => ({
  id: p.id,
  visitorName: p.visitorName,
  visitorPhone: p.visitorPhone,
  purpose: p.purpose,
  visitDateTime: p.visitDateTime,
  expiresAt: p.expiresAt,
  status: p.status,
  resident: p.resident && {
    name: p.resident.fullName,
    phone: p.resident.phoneNumber,
    houseNumber: p.resident.houseNumber,
  },
});

export const verifyPass = async (req, res) => {
  const token = extractToken(req.body.code);
  if (!token) return res.status(400).json({ success: false, message: 'Code is required' });

  const pass = await prisma.visitorPass.findUnique({
    where: { qrToken: token },
    include: { resident: { select: residentSelect } },
  });
  if (!pass) return res.json({ success: true, valid: false, reason: 'not_found' });

  const reason = await evaluatePass(pass);
  const settings = await getSettings();

  res.json({
    success: true,
    valid: !reason,
    reason,
    awaitingApproval: !reason && pass.status === 'PENDING',
    requiresApproval: !reason && settings.requireResidentApprovalAtGate && pass.status === 'ACTIVE',
    pass: passView(pass),
  });
};

export const requestPermission = async (req, res) => {
  const pass = await prisma.visitorPass.findUnique({
    where: { id: req.params.id },
    include: { resident: { select: residentSelect } },
  });
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

  const reason = await evaluatePass(pass);
  if (reason) return res.status(422).json({ success: false, valid: false, reason });
  if (pass.status === 'PENDING') {
    return res.status(409).json({ success: false, message: 'Permission already requested' });
  }

  await prisma.visitorPass.update({ where: { id: pass.id }, data: { status: 'PENDING' } });

  notify(req, pass.residentId, 'arrival:request', {
    passId: pass.id,
    visitorName: pass.visitorName,
    message: `Your visitor, ${pass.visitorName}, has arrived at the estate entrance. Do you authorize entry?`,
  });

  res.json({ success: true, status: 'PENDING' });
};

export const getApprovalStatus = async (req, res) => {
  const pass = await prisma.visitorPass.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

  if (pass.status === 'PENDING' && pass.expiresAt < new Date()) {
    await prisma.visitorPass.update({ where: { id: pass.id }, data: { status: 'EXPIRED' } });
    pass.status = 'EXPIRED';
  }
  res.json({ success: true, status: pass.status });
};

export const confirmEntry = async (req, res) => {
  const pass = await prisma.visitorPass.findUnique({
    where: { id: String(req.body.passId || '') },
  });
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

  const reason = await evaluatePass(pass);
  if (reason) return res.status(422).json({ success: false, valid: false, reason });

  if (pass.status === 'PENDING') {
    return res.status(403).json({
      success: false,
      reason: 'awaiting_approval',
      message: 'Resident has not approved this visitor yet',
    });
  }

  const log = await prisma.$transaction(async (tx) => {
    const claimed = await tx.visitorPass.updateMany({
      where: { id: pass.id, status: 'ACTIVE' },
      data: { status: 'INSIDE' },
    });
    if (claimed.count === 0) return null;
    return tx.accessLog.create({
      data: {
        passId: pass.id,
        guardId: req.user.id,
        visitorName: pass.visitorName,
        action: 'IN',
      },
    });
  });
  if (!log) return res.status(409).json({ success: false, reason: 'already_processed' });

  notify(req, pass.residentId, 'visitor:entered', {
    passId: pass.id,
    visitorName: pass.visitorName,
    timestamp: log.timestamp,
  });

  res.status(201).json({ success: true, log });
};

export const logExit = async (req, res) => {
  const pass = await prisma.visitorPass.findUnique({ where: { id: req.params.passId } });
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

  const log = await prisma.$transaction(async (tx) => {
    const claimed = await tx.visitorPass.updateMany({
      where: { id: pass.id, status: 'INSIDE' },
      data: { status: 'EXITED' },
    });
    if (claimed.count === 0) return null;
    return tx.accessLog.create({
      data: {
        passId: pass.id,
        guardId: req.user.id,
        visitorName: pass.visitorName,
        action: 'OUT',
      },
    });
  });
  if (!log) {
    return res.status(409).json({
      success: false,
      message: 'This visitor is not currently inside the estate',
    });
  }

  notify(req, pass.residentId, 'visitor:exited', {
    passId: pass.id,
    visitorName: pass.visitorName,
    timestamp: log.timestamp,
    message: `Your visitor, ${pass.visitorName}, has successfully exited the estate.`,
  });

  res.json({ success: true, log });
};

export const visitorsInside = async (req, res) => {
  const passes = await prisma.visitorPass.findMany({
    where: { status: 'INSIDE' },
    include: {
      resident: { select: residentSelect },
      logs: { where: { action: 'IN' }, orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  const now = Date.now();
  const data = passes
    .map((p) => {
      const entryAt = p.logs[0]?.timestamp || p.updatedAt;
      return {
        passId: p.id,
        visitorName: p.visitorName,
        visitorPhone: p.visitorPhone,
        resident: p.resident.fullName,
        residentPhone: p.resident.phoneNumber,
        houseNumber: p.resident.houseNumber,
        entryAt,
        minutesInside: Math.floor((now - new Date(entryAt).getTime()) / 60000),
      };
    })
    .sort((a, b) => new Date(a.entryAt) - new Date(b.entryAt));

  res.json({ success: true, count: data.length, data });
};

export const createWalkIn = async (req, res) => {
  const { visitorName, visitorPhone, purpose, houseNumber } = req.body;
  if (!visitorName || !visitorPhone || !houseNumber) {
    return res.status(400).json({
      success: false,
      message: 'visitorName, visitorPhone and houseNumber are required',
    });
  }

  if (await isBlocked(visitorPhone)) {
    return res.status(403).json({ success: false, reason: 'blocked' });
  }

  const residents = await prisma.user.findMany({
    where: { houseNumber: String(houseNumber).trim(), role: 'RESIDENT', isActive: true },
    select: { id: true },
  });
  if (!residents.length) {
    return res.status(404).json({ success: false, message: 'No active resident found for that house' });
  }

  const now = new Date();
  const pass = await prisma.visitorPass.create({
    data: {
      residentId: residents[0].id,
      visitorName: String(visitorName).trim(),
      visitorPhone: normPhone(visitorPhone),
      purpose: purpose ? `Walk-in: ${purpose}` : 'Walk-in',
      visitDateTime: now,
      qrToken: `WALKIN-${crypto.randomBytes(12).toString('hex')}`,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + WALKIN_TTL_MINUTES * 60000),
    },
  });

  residents.forEach((r) =>
    notify(req, r.id, 'walkin:request', {
      passId: pass.id,
      visitorName: pass.visitorName,
      purpose: pass.purpose,
      expiresAt: pass.expiresAt,
    })
  );

  res.status(201).json({ success: true, passId: pass.id, status: pass.status, expiresAt: pass.expiresAt });
};

export const getWalkIn = getApprovalStatus;

export const dashboard = async (req, res) => {
  const start = startOfTodayLagos();
  const [visitorsToday, inside, completedExits, awaitingApproval, expected] = await Promise.all([
    prisma.accessLog.count({ where: { action: 'IN', timestamp: { gte: start } } }),
    prisma.visitorPass.count({ where: { status: 'INSIDE' } }),
    prisma.accessLog.count({ where: { action: 'OUT', timestamp: { gte: start } } }),
    prisma.visitorPass.count({ where: { status: 'PENDING', expiresAt: { gt: new Date() } } }),
    prisma.visitorPass.count({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() } } }),
  ]);

  res.json({
    success: true,
    data: { visitorsToday, insideNow: inside, completedExits, awaitingApproval, expected },
  });
};

export const history = async (req, res) => {
  const { name, phone, house, date, action } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const where = {};
  if (name) where.visitorName = { contains: String(name).trim(), mode: 'insensitive' };
  if (action === 'IN' || action === 'OUT') where.action = action;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    where.timestamp = {
      gte: new Date(`${date}T00:00:00+01:00`),
      lt: new Date(new Date(`${date}T00:00:00+01:00`).getTime() + 86400000),
    };
  }
  const passWhere = {};
  if (phone) passWhere.visitorPhone = { contains: last10(phone) };
  if (house) passWhere.resident = { houseNumber: String(house).trim() };
  if (Object.keys(passWhere).length) where.pass = passWhere;

  const [data, total] = await Promise.all([
    prisma.accessLog.findMany({
      where,
      include: {
        pass: { select: { visitorPhone: true, purpose: true, resident: { select: residentSelect } } },
        guard: { select: { fullName: true } },
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.accessLog.count({ where }),
  ]);

  res.json({ success: true, page, limit, total, data });
};