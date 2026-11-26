import prisma from '../config/db.js';
import {
  getDefaultEstate,
  normalizePhone,
  generatePassCode,
  signQrPayload,
  verifyQrPayload,
} from '../utils/helpers.js';

const TZ = 'Africa/Lagos';
const WALKIN_TTL_SECONDS = 60; 

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const startOfTodayLagos = () => new Date(`${dayKey(new Date())}T00:00:00+01:00`);

const isBlocked = async (phone, houseId = null) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  return prisma.blockedVisitor.findFirst({
    where: {
      phoneNumber: normalized,
      OR: [
        { scope: 'ESTATE' },
        ...(houseId ? [{ scope: 'HOUSE', houseId }] : []),
      ],
    },
  });
};

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

// Evaluates pass validity 
const evaluatePass = async (pass, estateId) => {
  if (pass.estateId !== estateId) return 'WRONG_ESTATE';
  if (await isBlocked(pass.visitorPhone, pass.resident?.houseId)) return 'BLOCKED';

  if (pass.status === 'INSIDE' || pass.status === 'EXITED') return 'ALREADY_USED';
  if (pass.status === 'CANCELLED' || pass.status === 'REJECTED') return 'NOT_FOUND';

  const now = new Date();
  if (now < new Date(pass.validFrom)) return 'NOT_YET_VALID';

  if (now > new Date(pass.validTo) || pass.status === 'EXPIRED') {
    await prisma.visitorPass.updateMany({
      where: { id: pass.id, status: { in: ['ACTIVE', 'PENDING'] } },
      data: { status: 'EXPIRED' },
    });
    return 'EXPIRED';
  }
  return null;
};

const residentSelect = {
  id: true,
  fullName: true,
  phoneNumber: true,
  houseNumber: true,
  houseId: true,
};

const passView = (p) => ({
  id: p.id,
  passCode: p.passCode,
  visitorName: p.visitorName,
  visitorPhone: p.visitorPhone,
  purpose: p.purpose,
  visitDateTime: p.visitDateTime,
  validFrom: p.validFrom,
  validTo: p.validTo,
  status: p.status,
  resident: p.resident && {
    name: p.resident.fullName,
    phone: p.resident.phoneNumber,
    houseNumber: p.resident.houseNumber,
  },
});

// 1. VERIFY PASS (Supports both signed QR JWT and 6-char manual code)
export const verifyPass = async (req, res) => {
  try {
    const rawCode = extractToken(req.body.code || req.body.qrToken || req.body.passCode);
    if (!rawCode) {
      return res.status(400).json({ success: false, message: 'QR token or pass code is required.' });
    }

    const estate = await getDefaultEstate();
    let pass = null;

    if (rawCode.length === 6) {
      pass = await prisma.visitorPass.findUnique({
        where: { passCode: rawCode.toUpperCase() },
        include: { resident: { select: residentSelect } },
      });
    } else {
      let decoded;
      try {
        decoded = verifyQrPayload(rawCode);
      } catch (err) {
        return res.json({
          success: true,
          valid: false,
          reason: err.name === 'TokenExpiredError' ? 'EXPIRED' : 'NOT_FOUND',
        });
      }

      if (decoded.estateId && decoded.estateId !== estate.id) {
        return res.json({ success: true, valid: false, reason: 'WRONG_ESTATE' });
      }

      pass = await prisma.visitorPass.findUnique({
        where: { id: decoded.passId },
        include: { resident: { select: residentSelect } },
      });
    }

    if (!pass || pass.status === 'CANCELLED' || pass.status === 'REJECTED') {
      return res.json({ success: true, valid: false, reason: 'NOT_FOUND' });
    }

    const reason = await evaluatePass(pass, estate.id);

    // Rule #5: Name-only match gives a warning, NOT a hard block
    const nameMatch = !reason
      ? await prisma.blockedVisitor.findFirst({
          where: {
            estateId: estate.id,
            fullName: { equals: pass.visitorName, mode: 'insensitive' },
          },
        })
      : null;

    res.json({
      success: true,
      valid: !reason,
      reason,
      possibleMatchWarning: Boolean(nameMatch),
      warningMessage: nameMatch
        ? `Possible name match on blocklist (${nameMatch.fullName}) — phone did not match.`
        : null,
      awaitingApproval: !reason && pass.status === 'PENDING',
      requiresApproval: !reason && estate.requireResidentApprovalAtGate && pass.status === 'ACTIVE',
      pass: passView(pass),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. REQUEST PERMISSION AT GATE
export const requestPermission = async (req, res) => {
  try {
    const estate = await getDefaultEstate();
    const pass = await prisma.visitorPass.findUnique({
      where: { id: req.params.id },
      include: { resident: { select: residentSelect } },
    });
    if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

    const reason = await evaluatePass(pass, estate.id);
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. POLL APPROVAL STATUS
export const getApprovalStatus = async (req, res) => {
  try {
    const pass = await prisma.visitorPass.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, validTo: true, isWalkIn: true },
    });
    if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

    if (pass.status === 'PENDING' && pass.validTo < new Date()) {
      const nextStatus = pass.isWalkIn ? 'TIMED_OUT' : 'EXPIRED';
      await prisma.visitorPass.update({ where: { id: pass.id }, data: { status: nextStatus } });
      pass.status = nextStatus;
    }

    res.json({ success: true, status: pass.status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. CONFIRM ENTRY 
export const confirmEntry = async (req, res) => {
  try {
    const estate = await getDefaultEstate();
    const pass = await prisma.visitorPass.findUnique({
      where: { id: String(req.body.passId || '') },
      include: { resident: { select: residentSelect } },
    });
    if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

    const reason = await evaluatePass(pass, estate.id);
    if (reason) return res.status(422).json({ success: false, valid: false, reason });

    if (pass.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        reason: 'AWAITING_APPROVAL',
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
          visitorPhone: pass.visitorPhone,
          gateName: req.body.gateName || 'Main Gate',
          action: 'IN',
        },
      });
    });

    if (!log) return res.status(409).json({ success: false, reason: 'ALREADY_USED' });

    notify(req, pass.residentId, 'visitor:entered', {
      passId: pass.id,
      visitorName: pass.visitorName,
      timestamp: log.timestamp,
    });

    res.status(201).json({ success: true, log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. LOG EXIT FROM "INSIDE NOW" LIST
export const logExit = async (req, res) => {
  try {
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
          visitorPhone: pass.visitorPhone,
          gateName: req.body.gateName || 'Main Gate',
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. VISITORS CURRENTLY INSIDE OR TODAY'S ENTRIES
export const visitorsInside = async (req, res) => {
  try {
    if (req.query.tab === 'today') {
const todayLogs = await prisma.accessLog.findMany({
where: { action: 'IN', timestamp: { gte: startOfTodayLagos() } },
orderBy: { timestamp: 'desc' },
});
return res.json({ success: true, count: todayLogs.length, data: todayLogs });
}
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
const entryAt = p.logs?.timestamp || p.updatedAt;
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
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};
// 7. CREATE WALK-IN VISITOR REQUEST (60s timeout)
export const createWalkIn = async (req, res) => {
try {
const { visitorName, visitorPhone, purpose, houseNumber } = req.body;
if (!visitorName || !visitorPhone || !houseNumber) {
return res.status(400).json({
success: false,
message: 'visitorName, visitorPhone and houseNumber are required',
});
}
const estate = await getDefaultEstate();
const normalizedPhone = normalizePhone(visitorPhone);
const resident = await prisma.user.findFirst({
where: {
role: 'RESIDENT',
houseNumber: { equals: String(houseNumber).trim(), mode: 'insensitive' },
},
});
if (!resident) {
return res.status(404).json({ success: false, message: 'No resident found for that house.' });
}
if (await isBlocked(normalizedPhone, resident.houseId)) {
return res.status(403).json({ success: false, reason: 'BLOCKED', message: 'Visitor is blocked.' });
}
const now = new Date();
const validTo = new Date(now.getTime() + WALKIN_TTL_SECONDS * 1000);
const passCode = generatePassCode();
const created = await prisma.visitorPass.create({
data: {
estateId: estate.id,
residentId: resident.id,
visitorName: visitorName.trim(),
visitorPhone: normalizedPhone,
purpose: purpose ? purpose.trim() : 'Walk-in visit',
passCode,
qrToken: 'TEMP_' + passCode,
status: 'PENDING',
visitDateTime: now,
validFrom: now,
validTo,
isWalkIn: true,
},
});
const qrToken = signQrPayload({
passId: created.id,
code: passCode,
estateId: estate.id,
validFrom: now.toISOString(),
validTo: validTo.toISOString(),
});
const pass = await prisma.visitorPass.update({
where: { id: created.id },
data: { qrToken },
});
notify(req, resident.id, 'walkin:request', {
passId: pass.id,
visitorName: pass.visitorName,
expiresInSeconds: WALKIN_TTL_SECONDS,
message: `Walk-in visitor ${pass.visitorName} is at the gate requesting entry.`,
});
res.status(201).json({ success: true, pass });
} catch (error) {
res.status(500).json({ success: false, message: error.message });
}
};