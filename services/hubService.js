/**
 * Kymor Hub Service — Hub Data Access Layer
 */
import prisma from '../lib/prisma.js';
import { generateShortId, generateToken } from '../lib/crypto.js';

// ─── Hub Lookups ───────────────────────────────────────

export const getHubById = async (id) => {
    return prisma.hub.findUnique({ where: { id } });
};

export const getHubByShortId = async (shortId) => {
    return prisma.hub.findUnique({ where: { shortId } });
};

export const getHubByApiKey = async (apiKey) => {
    return prisma.hub.findUnique({ where: { apiKey } });
};

export const getHubWithOwner = async (shortId) => {
    return prisma.hub.findUnique({ where: { shortId }, include: { owner: { select: { id: true, username: true, isPremium: true, email: true } } } });
};

export const getHubsByOwner = async (ownerId) => {
    return prisma.hub.findMany({
        where: { ownerId },
        include: {
            scripts: { select: { id: true, scriptId: true, name: true, executions: true, isActive: true, obfuscator: true, createdAt: true } },
            checkpoints: { orderBy: { sortOrder: 'asc' } },
            _count: { select: { keys: true, executionLogs: true, playerSessions: true, blacklists: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const getOwnedHub = async (shortId, ownerId) => {
    return prisma.hub.findFirst({ where: { shortId, ownerId } });
};

// ─── Hub Creation ──────────────────────────────────────

export const createHub = async (ownerId, name) => {
    return prisma.hub.create({
        data: {
            ownerId, name,
            shortId: generateShortId(4),
            apiKey: generateToken(16),
        }
    });
};

// ─── Hub Updates ───────────────────────────────────────

export const updateHub = async (hubId, data) => {
    return prisma.hub.update({ where: { id: hubId }, data });
};

export const togglePause = async (hubId) => {
    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    return prisma.hub.update({ where: { id: hubId }, data: { paused: !hub.paused } });
};

export const regenerateApiKey = async (hubId) => {
    const newKey = generateToken(16);
    return prisma.hub.update({ where: { id: hubId }, data: { apiKey: newKey } });
};

export const updateRewardsConfig = async (hubId, config) => {
    return prisma.hub.update({ where: { id: hubId }, data: config });
};

export const updatePageConfig = async (hubId, config) => {
    return prisma.hub.update({ where: { id: hubId }, data: config });
};

// ─── Hub Deletion ──────────────────────────────────────

export const deleteHub = async (hubId) => {
    return prisma.hub.delete({ where: { id: hubId } });
};

// ─── Hub Stats ─────────────────────────────────────────

export const getHubStats = async (hubId) => {
    const [keys, executions, online, scripts, blacklists] = await Promise.all([
        prisma.key.count({ where: { hubId } }),
        prisma.executionLog.count({ where: { hubId } }),
        prisma.playerSession.count({ where: { hubId } }),
        prisma.script.count({ where: { hubId } }),
        prisma.blacklist.count({ where: { hubId } }),
    ]);
    return { keys, executions, online, scripts, blacklists };
};

export const getHubAnalytics = async (hubId, options = {}) => {
    const { logLimit = 100, daysBack = 7 } = options;
    const since = new Date(Date.now() - daysBack * 86400000);

    const [recentLogs, players, dailyCounts] = await Promise.all([
        prisma.executionLog.findMany({ where: { hubId }, orderBy: { createdAt: 'desc' }, take: logLimit }),
        prisma.playerSession.findMany({ where: { hubId }, orderBy: { lastPing: 'desc' } }),
        prisma.executionLog.groupBy({
            by: ['createdAt'],
            where: { hubId, createdAt: { gte: since } },
            _count: { id: true }
        }).catch(() => [])
    ]);

    return { recentLogs, players, dailyCounts };
};

// ─── Hub Count ─────────────────────────────────────────

export const countHubsByOwner = async (ownerId) => {
    return prisma.hub.count({ where: { ownerId } });
};
