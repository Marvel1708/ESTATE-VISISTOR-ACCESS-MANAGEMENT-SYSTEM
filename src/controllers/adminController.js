import prisma from '../config/db.js';

const TZ = 'Africa/Lagos';
const OVERSTAY_HOURS = 6;

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const hourOf = (d) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
const startOfTodayLagos = () => new Date(`${dayKey(new Date())}T00:00:00+01:00`);

const normPhone = (p = '') => {
  let d = String(p).replace(/\D/g, '');
  if (d.startsWith('234')) d = '0' + d.slice(3);
  if (d.length === 10) d = '0' + d;
  return d;
};
const last10 = (p = '') => String(p).replace(/\D/g, '').slice(-10);

const residentSelect = { id: true, fullName: true, phoneNumber: true, houseNumber: true };

export const dashboard = async (req, res) => {
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
    prisma.visitorPass.count({ where: { status: 'PENDING', expiresAt: { gt: new Date() } } }),
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
      entryAt: p.logs[0]?.timestamp || p.updatedAt,
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
};

const buildLogWhere = (q) => {
  const { from, to, house, phone, name, action } = q;
  const where = {};

  if (from || to) {
    where.timestamp = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) where.timestamp.gte = new Date(`${from}T00:00:00+01:00`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) where.timestamp.lt = new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86400000);
    if (!Object.keys(where.timestamp).length) delete where.timestamp;
  }
  if (name) where.visitorName = { contains: String(name).trim(), mode: 'insensitive' };
  if (action === 'IN' || action === 'OUT') where.action = action;

  const passWhere = {};
  if (phone) passWhere.visitorPhone = { contains: last10(phone) };
  if (house) passWhere.resident = { houseNumber: String(house).trim() };
  if (Object.keys(passWhere).length) where.pass = passWhere;
  return where;
};

const logInclude = {
  pass: { select: { visitorPhone: true, purpose: true, resident: { select: residentSelect } } },
  guard: { select: { id: true, fullName: true } },
};

export const history = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const where = buildLogWhere(req.query);

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
};

export const exportHistory = async (req, res) => {
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
      l.pass.visitorPhone,
      l.pass.resident.fullName,
      l.pass.resident.houseNumber,
      l.pass.purpose,
      l.guard.fullName,
      l.gateName,
    ].map(cell).join(',')
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="visitor-log-${dayKey(new Date())}.csv"`
  );
  res.send('\uFEFF' + [header.map(cell).join(','), ...rows].join('\n'));
};

export const listBlocked = async (req, res) => {
  const data = await prisma.blockedVisitor.findMany({
    orderBy: { blockedDate: 'desc' },
    include: { blockedBy: { select: { fullName: true } } },
  });
  res.json({ success: true, count: data.length, data });
};

export const addBlocked = async (req, res) => {
  const { fullName, phoneNumber, reason } = req.body;
  if (!fullName || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'fullName and phoneNumber are required' });
  }
  const phone = normPhone(phoneNumber);
  if (phone.length < 10) {
    return res.status(400).json({ success: false, message: 'Invalid phone number' });
  }

  const data = await prisma.blockedVisitor.upsert({
    where: { phoneNumber: phone },
    update: { fullName: String(fullName).trim(), reason: reason || undefined, blockedById: req.user.id },
    create: {
      fullName: String(fullName).trim(),
      phoneNumber: phone,
      reason: reason || undefined,
      blockedById: req.user.id,
    },
  });
  res.status(201).json({ success: true, data });
};

export const removeBlocked = async (req, res) => {
  try {
    const data = await prisma.blockedVisitor.delete({ where: { id: req.params.id } });
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Blocked entry not found' });
    }
    throw err;
  }
};

const getOrCreateSettings = () =>
  prisma.estateSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

export const getSettings = async (req, res) => {
  res.json({ success: true, data: await getOrCreateSettings() });
};

export const updateSettings = async (req, res) => {
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
      return res.status(400).json({ success: false, message: 'passExpiryHours must be a whole number from 1 to 168' });
    }
    data.passExpiryHours = b.passExpiryHours;
  }
  for (const key of ['requireResidentApprovalAtGate', 'notificationsEnabled']) {
    if (b[key] !== undefined) {
      if (typeof b[key] !== 'boolean') {
        return res.status(400).json({ success: false, message: `${key} must be true or false` });
      }
      data[key] = b[key];
    }
  }
  if (b.estateRules !== undefined) {
    if (
      !Array.isArray(b.estateRules) || b.estateRules.length > 30 ||
      !b.estateRules.every((r) => typeof r === 'string' && r.trim())
    ) {
      return res.status(400).json({ success: false, message: 'estateRules must be a list of up to 30 non-empty strings' });
    }
    data.estateRules = b.estateRules.map((r) => r.trim());
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await prisma.estateSetting.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json({ success: true, data: settings });
};

