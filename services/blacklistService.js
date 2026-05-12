/**
 * Kymor Blacklist Service — Hub-scoped Blacklists + Security Events
 */
import prisma from '../lib/prisma.js';

// ─── Blacklist Operations ──────────────────────────────

export const checkBlacklisted = async (target, hubId = null) => {
    const where = { target };
    if (hubId) where.hubId = hubId;
    const result = await prisma.blacklist.findFirst({ where });
    return result !== null;
};

export const checkBlacklistedMulti = async (targets = [], hubId = null) => {
    const where = { target: { in: targets } };
    if (hubId) where.hubId = hubId;
    return prisma.blacklist.findFirst({ where });
};

export const addToBlacklist = async (hubId, target, reason = 'Manual ban') => {
    return prisma.blacklist.create({ data: { hubId, target, reason } });
};

export const addGlobalBlacklist = async (target, reason = 'Global Security Ban') => {
    return prisma.blacklist.create({ data: { target, reason, hubId: null } });
};

export const removeFromBlacklist = async (banId, hubId = null) => {
    const where = { id: banId };
    if (hubId) where.hubId = hubId;
    return prisma.blacklist.delete({ where });
};

export const getBlacklist = async (hubId = null, options = {}) => {
    const { skip = 0, take = 100, search } = options;
    const where = {};
    if (hubId) where.hubId = hubId;
    if (search) where.target = { contains: search };
    return prisma.blacklist.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } });
};

export const countBlacklist = async (hubId = null) => {
    const where = {};
    if (hubId) where.hubId = hubId;
    return prisma.blacklist.count({ where });
};

export const clearBlacklist = async (hubId) => {
    return prisma.blacklist.deleteMany({ where: { hubId } });
};

// ─── Auto-Ban (from Panda honeypot) ───────────────────

export const autoBlacklistIfHighRisk = async (ipAddress, hwid, bypassScore, hubId = null) => {
    if (bypassScore < 75) return false;

    const exists = await checkBlacklisted(ipAddress, hubId);
    if (exists) return true;

    await prisma.blacklist.create({
        data: {
            hubId,
            target: ipAddress,
            reason: `Auto-ban: Bypass score ${bypassScore.toFixed(0)}%`
        }
    });

    if (hwid) {
        await prisma.blacklist.create({
            data: { hubId, target: hwid, reason: `Auto-ban: Linked to high-risk IP ${ipAddress}` }
        }).catch(() => {}); // Ignore if already exists
    }

    return true;
};

// ─── Security Events ──────────────────────────────────

export const logSecurityEvent = async (data) => {
    return prisma.securityEvent.create({ data }).catch(() => null);
};

export const getSecurityEvents = async (options = {}) => {
    const { skip = 0, take = 100, severity, ip } = options;
    const where = {};
    if (severity) where.severity = severity;
    if (ip) where.ipAddress = ip;
    return prisma.securityEvent.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } });
};

export const getSecurityStats = async (since = null) => {
    const where = since ? { createdAt: { gte: since } } : {};
    const [total, critical, high, medium, low] = await Promise.all([
        prisma.securityEvent.count({ where }),
        prisma.securityEvent.count({ where: { ...where, severity: 'CRITICAL' } }),
        prisma.securityEvent.count({ where: { ...where, severity: 'HIGH' } }),
        prisma.securityEvent.count({ where: { ...where, severity: 'MEDIUM' } }),
        prisma.securityEvent.count({ where: { ...where, severity: 'LOW' } }),
    ]);
    return { total, critical, high, medium, low };
};

export const clearOldSecurityEvents = async (daysOld = 30) => {
    const cutoff = new Date(Date.now() - daysOld * 86400000);
    return prisma.securityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
};
