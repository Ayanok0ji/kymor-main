/**
 * Kymor Key Service — Data Access Layer (from Panda pattern)
 * All key-related database operations go through here
 */
import prisma from '../lib/prisma.js';
import { generateKeyString } from '../lib/crypto.js';

// ─── Key Lookups ───────────────────────────────────────

export const getKeyByValue = async (keyString, hubId) => {
    return prisma.key.findFirst({ where: { keyString, hubId } });
};

export const getKeyByHwid = async (hwid, hubId) => {
    return prisma.key.findFirst({ where: { hwid, hubId } });
};

export const getKeyByHwidAndHub = async (hwid, hubShortId) => {
    return prisma.key.findFirst({ where: { hwid, hub: { shortId: hubShortId } } });
};

export const getKeyWithoutHwid = async (keyString, hubId) => {
    return prisma.key.findFirst({ where: { keyString, hubId } });
};

export const getPremiumKeys = async (hubId) => {
    return prisma.key.findMany({ where: { hubId, isTrial: false, status: 'ACTIVE' } });
};

// ─── Key Creation ──────────────────────────────────────

export const createKey = async (data) => {
    return prisma.key.create({ data });
};

export const createBulkKeys = async (hubId, options = {}) => {
    const { amount = 1, durationHours = null, note = '', nonHwid = false, boundScriptId = null, isPremiumUser = false } = options;
    const count = Math.min(parseInt(amount) || 1, 100);
    const keys = [];

    for (let i = 0; i < count; i++) {
        keys.push({
            hubId,
            keyString: generateKeyString(isPremiumUser),
            expiresAt: durationHours ? new Date(Date.now() + durationHours * 3600000) : null,
            note: note || '',
            nonHwid: nonHwid || false,
            boundScriptId: boundScriptId || null
        });
    }

    await prisma.key.createMany({ data: keys });
    await prisma.hub.update({ where: { id: hubId }, data: { statsKeys: { increment: count } } });

    return { count, keys: keys.map(k => k.keyString) };
};

// ─── Key Mutations ─────────────────────────────────────

export const updateKeyStatus = async (keyId, hubId, status) => {
    return prisma.key.update({ where: { id: keyId, hubId }, data: { status } });
};

export const updateKeyHwid = async (keyId, hubId, newHwid) => {
    return prisma.key.update({ where: { id: keyId, hubId }, data: { hwid: newHwid } });
};

export const resetKeyHwid = async (keyId, hubId) => {
    return prisma.key.update({ where: { id: keyId, hubId }, data: { hwid: null, lastHwidReset: new Date() } });
};

export const updateKeyNote = async (keyId, hubId, note) => {
    return prisma.key.update({ where: { id: keyId, hubId }, data: { note } });
};

export const updateKeyExpiry = async (keyId, hubId, expiresAt) => {
    return prisma.key.update({ where: { id: keyId, hubId }, data: { expiresAt } });
};

export const extendKeyExpiry = async (keyId, hubId, additionalSeconds) => {
    const key = await prisma.key.findFirst({ where: { id: keyId, hubId } });
    if (!key || !key.expiresAt) return null;
    const baseTime = Math.max(Date.now(), key.expiresAt.getTime());
    const newExpiry = new Date(baseTime + additionalSeconds * 1000);
    return prisma.key.update({ where: { id: key.id }, data: { expiresAt: newExpiry } });
};

// ─── Key Deletion ──────────────────────────────────────

export const deleteKey = async (keyId, hubId) => {
    return prisma.key.delete({ where: { id: keyId, hubId } });
};

export const deleteKeyByString = async (keyString, hubId) => {
    const key = await prisma.key.findFirst({ where: { keyString, hubId } });
    if (!key) return null;
    return prisma.key.delete({ where: { id: key.id } });
};

export const deleteAllKeys = async (hubId) => {
    return prisma.key.deleteMany({ where: { hubId } });
};

export const deleteAllExpiredKeys = async (hubId) => {
    return prisma.key.deleteMany({ where: { hubId, expiresAt: { lt: new Date() }, status: { not: 'BANNED' } } });
};

export const deleteAllBannedKeys = async (hubId) => {
    return prisma.key.deleteMany({ where: { hubId, status: 'BANNED' } });
};

// ─── Key Queries ───────────────────────────────────────

export const getAllKeys = async (hubId, options = {}) => {
    const { skip = 0, take = 500, status, search, orderBy = 'desc' } = options;
    const where = { hubId };
    if (status) where.status = status;
    if (search) where.keyString = { contains: search };
    return prisma.key.findMany({ where, skip, take, orderBy: { createdAt: orderBy } });
};

export const countKeys = async (hubId, status = null) => {
    const where = { hubId };
    if (status) where.status = status;
    return prisma.key.count({ where });
};

export const countActiveKeys = async (hubId) => {
    return prisma.key.count({ where: { hubId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
};

export const getExpiredKeys = async (hubId) => {
    return prisma.key.findMany({ where: { hubId, expiresAt: { lt: new Date() }, status: 'ACTIVE' } });
};

// ─── Bulk Operations ───────────────────────────────────

export const banKeysByHwid = async (hubId, hwid) => {
    return prisma.key.updateMany({ where: { hubId, hwid }, data: { status: 'BANNED' } });
};

export const resetAllHwids = async (hubId) => {
    return prisma.key.updateMany({ where: { hubId }, data: { hwid: null, lastHwidReset: new Date() } });
};
