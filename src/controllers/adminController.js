import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { getDefaultEstate, normalizePhone } from '../utils/helpers.js';

const TZ = 'Africa/Lagos';
const OVERSTAY_HOURS = 6;

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const hourOf = (d) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
const startOfTodayLagos = () => new Date(`${dayKey(new Date())}T00:00:00+01:00`);

const residentSelect = { id: true, fullName: true, phoneNumber: true, houseNumber: true };

export const dashboard = async (_req, res) => {
  try {
    const startToday = startOfTodayLagos();
    const sevenDaysAgo = new Date(startToday.getTime() - 6 * 86400000);
    const overstayCutoff = new Date(Date.now() - OVERSTAY_HOURS * 3600000);

    const [
      totalResidents, totalGuards, visitorsToday, insideNow, completedToday,
      pendingApprovals, rejectedToday, recentEntries, insidePasses,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'RESIDENT' } }),
      prisma.user.count({ where: { role: 'GUARD' } }),
      prisma.accessLog.count({ where: { action: 'IN', timestamp: { gte: startToday } } }),
      prisma.visitorPass.count({ where: { status: 'INSIDE' } }),
      prisma.accessLog.count({ where: { action: 'OUT', timestamp: { gte: startToday } } }),
      prisma.visitorPass.count({ where: { status: 'PENDING', validTo: { gt: new Date() } } }),
      prisma.visitorPass.count({ where: { status: 'REJECTED', updatedAt: { gte: startToday } } }),
      prisma.accessLog.findMany({
        where: { action: 'IN', timestamp: { gte: sevenDaysAgo } },
        select: { timestamp: true },
      }),
      prisma.visitorPass.findMany({
        where: { status: 'INSIDE' },
        include: {
          resident: { select: { houseNumber: true } },
          logs: { where: { action: 'IN' }, orderBy: { timestamp: 'desc' }, take: 1 },
        },
      }),
    ]);

    const perDay = {};
    const perHour = {};
    for (const { timestamp } of recentEntries) {
      const k = dayKey(timestamp);
      perDay[k] = (perDay[k] || 0) + 1;
      const h = hourOf(timestamp);
      perHour[h] = (perHour[h] || 0) + 1;
    }

    const visitorsPerDay = [];
    for (let i = 6; i >= 0; i--) {
      const k = dayKey(new Date(startToday.getTime() - i * 86400000 + 12 * 3600000));
      visitorsPerDay.push({ date: k, count: perDay[k] || 0 });
    }

    const peakHours = Object.entries(perHour)
      .map(([hour, count]) => ({ hour: Number(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const overstays = insidePasses
      .map((p) => ({
        passId: p.id,
        visitorName: p.visitorName,
        houseNumber: p.resident.houseNumber,
        entryAt: p.logs?.[0]?.timestamp || p.updatedAt,
      }))
      .filter((p) => new Date(p.entryAt) < overstayCutoff)
      .map((p) => ({
        ...p,
        hoursInside: +((Date.now() - new Date(p.entryAt).getTime()) / 3600000).toFixed(1),
      }));

    res.json({
      success: true,
      data: {
        totalResidents, totalGuards, visitorsToday, insideNow, completedToday,
        pendingApprovals, rejectedToday, visitorsPerDay, peakHours,
        overstayHoursThreshold: OVERSTAY_HOURS,
        overstays,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const listUsers = async (req, res) => {
  try {
    const filter = req.query.role ? { role: req.query.role.toUpperCase() } : {};
    const users = await prisma.user.findMany({
      where: filter,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        houseNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createGuard = async (req, res) => {
  try {
    const { fullName, phoneNumber, password } = req.body;
    if (!fullName || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'Full name, phone number, and password are required.' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const exists = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Phone number already registered.' });
    }

    const estate = await getDefaultEstate();
    const newGuard = await prisma.user.create({
      data: {
        estateId: estate.id,
        fullName: fullName.trim(),
        phoneNumber: normalizedPhone,
        password: await bcrypt.hash(password, 10),
        role: 'GUARD',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Security Guard account created successfully!',
      guard: {
        id: newGuard.id,
        fullName: newGuard.fullName,
        phoneNumber: newGuard.phoneNumber,
        role: newGuard.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const assignResidentHouse = async (req, res) => {
  try {
    const { houseNumber } = req.body;
    if (!houseNumber) {
      return res.status(400).json({ success: false, message: 'houseNumber is required.' });
    }

    const estate = await getDefaultEstate();
    const cleanLabel = String(houseNumber).trim();

    const house = await prisma.house.upsert({
      where: { estateId_label: { estateId: estate.id, label: cleanLabel } },
      update: {},
      create: { estateId: estate.id, label: cleanLabel },
    });

    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { houseId: house.id, houseNumber: cleanLabel },
      select: residentSelect,
    });

    res.json({ success: true, message: 'House assigned.', user: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own Admin account.' });
    }

    await prisma.user.delete({ where: { id: req.params.userId } });
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adminCancelPass = async (req, res) => {
  try {
    const pass = await prisma.visitorPass.findUnique({ where: { id: req.params.id } });
    if (!pass) return res.status(404).json({ success: false, message: 'Pass not found.' });
    if (pass.status !== 'ACTIVE' && pass.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a pass after entry.' });
    }

    const cancelled = await prisma.visitorPass.update({
      where: { id: pass.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ success: true, message: 'Pass cancelled.', pass: cancelled });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const buildLogWhere = (q) => {
  const { from, to, house, phone, name, action } = q;
  const where = {};

  if (from || to) {
    where.timestamp = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) where.timestamp.gte = new Date(`${from}T00:00:00+01:00`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.timestamp.lt = new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86400000);
    }
    if (!Object.keys(where.timestamp).length) delete where.timestamp;
  }
  if (name) where.visitorName = { contains: String(name).trim(), mode: 'insensitive' };
  if (action === 'IN' || action === 'OUT') where.action = action;

  if (phone) {
    where.visitorPhone = normalizePhone(phone);
  }
  if (house) {
    where.pass = { resident: { houseNumber: String(house).trim() } };
  }
  return where;
};

const logInclude = {
  pass: { select: { visitorPhone: true, purpose: true, resident: { select: residentSelect } } },
  guard: { select: { id: true, fullName: true } },
};

export const history = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const where = buildLogWhere(req.query);

    if (req.query.phone) {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.id,
          action: 'SEARCH_VISITOR_PHONE',
          searchQuery: normalizePhone(req.query.phone),
        },
      });
    }

    const [data, total] = await Promise.all([
      prisma.accessLog.findMany({
        where,
        include: logInclude,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.accessLog.count({ where }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportHistory = async (req, res) => {
  try {
    const logs = await prisma.accessLog.findMany({
      where: buildLogWhere(req.query),
      include: logInclude,
      orderBy: { timestamp: 'desc' },
      take: 20000,
    });

    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const header = ['Time (Lagos)', 'Action', 'Visitor', 'Visitor Phone', 'Resident', 'House', 'Purpose', 'Guard', 'Gate'];
    const rows = logs.map((l) =>
      [
        l.timestamp.toLocaleString('en-GB', { timeZone: TZ }),
        l.action === 'IN' ? 'Entry' : 'Exit',
        l.visitorName,
l.pass?.visitorPhone || l.visitorPhone || '',
l.pass?.resident?.fullName || '',
l.pass?.resident?.houseNumber || '',
l.pass?.purpose || '',
l.guard?.fullName || '',
l.gateName,
].map(cell).join(',')
);
res.setHeader('Content-Type', 'text/csv; charset=utf-8');
res.setHeader('Content-Disposition', 'attachment; filename="visitor-log-${dayKey(new Date())}.csv"');
res.send('\uFEFF' + [header.map(cell).join(','), ...rows].join('\n'));
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};
export const listBlocked = async (_req, res) => {
try {
const data = await prisma.blockedVisitor.findMany({
orderBy: { blockedDate: 'desc' },
include: { blockedBy: { select: { fullName: true } } },
});
res.json({ success: true, count: data.length, data });
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};
export const addBlocked = async (req, res) => {
try {
const { fullName, phoneNumber, reason } = req.body;
if (!fullName || !phoneNumber) {
return res.status(400).json({ success: false, message: 'fullName and phoneNumber are required' });
}
const estate = await getDefaultEstate();
const phone = normalizePhone(phoneNumber);
const existing = await prisma.blockedVisitor.findFirst({
where: { estateId: estate.id, phoneNumber: phone, scope: 'ESTATE' },
});
const data = existing
? await prisma.blockedVisitor.update({
where: { id: existing.id },
data: { fullName: String(fullName).trim(), reason: reason || existing.reason, blockedById: req.user.id },
})
: await prisma.blockedVisitor.create({
data: {
estateId: estate.id,
fullName: String(fullName).trim(),
phoneNumber: phone,
reason: reason || 'Security violation',
scope: 'ESTATE',
blockedById: req.user.id,
},
});
res.status(201).json({ success: true, data });
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};
export const removeBlocked = async (req, res) => {
try {
const data = await prisma.blockedVisitor.delete({ where: { id: req.params.id } });
res.json({ success: true, data });
} catch (err) {
if (err.code === 'P2025') {
return res.status(404).json({ success: false, message: 'Blocked entry not found' });
}
res.status(500).json({ success: false, message: err.message });
}
};
export const getSettings = async (_req, res) => {
try {
const estate = await getDefaultEstate();
res.json({ success: true, data: estate });
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};
export const updateSettings = async (req, res) => {
try {
const estate = await getDefaultEstate();
const b = req.body;
const data = {};
if (b.estateName !== undefined) {
if (typeof b.estateName !== 'string' || !b.estateName.trim()) {
return res.status(400).json({ success: false, message: 'Invalid estateName' });
}
data.estateName = b.estateName.trim();
}
if (b.passExpiryHours !== undefined) {
if (!Number.isInteger(b.passExpiryHours) || b.passExpiryHours < 1 || b.passExpiryHours > 168) {
return res.status(400).json({ success: false, message: 'passExpiryHours must be between 1 and 168' });
}
data.passExpiryHours = b.passExpiryHours;
}
if (b.requireResidentApprovalAtGate !== undefined) {
data.requireResidentApprovalAtGate = Boolean(b.requireResidentApprovalAtGate);
}
if (b.estateRules !== undefined && Array.isArray(b.estateRules)) {
data.estateRules = b.estateRules;
}
if (b.notificationsEnabled !== undefined) {
data.notificationsEnabled = Boolean(b.notificationsEnabled);
}
const updated = await prisma.estate.update({
where: { id: estate.id },
data,
});
res.json({ success: true, data: updated });
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};