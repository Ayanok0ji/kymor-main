/**
 * Kymor Script Service — Encrypted Script Operations
 */
import prisma from '../lib/prisma.js';
import { encryptCode, decryptCode, generateShortId } from '../lib/crypto.js';

// ─── Script Lookups ────────────────────────────────────

export const getScriptByScriptId = async (scriptId) => {
    return prisma.script.findUnique({ where: { scriptId } });
};

export const getScriptWithHub = async (scriptId) => {
    return prisma.script.findUnique({ where: { scriptId }, include: { hub: true } });
};

export const getScriptsByHub = async (hubId) => {
    return prisma.script.findMany({
        where: { hubId },
        select: { id: true, scriptId: true, name: true, executions: true, isActive: true, obfuscator: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
    });
};

// ─── Script Creation ───────────────────────────────────

export const createScript = async (hubId, name, code, options = {}) => {
    const { obfuscator = 'none' } = options;
    const { encrypted, iv, tag } = encryptCode(code);

    return prisma.script.create({
        data: {
            hubId, name,
            scriptId: generateShortId(6),
            code: encrypted,
            codeIv: iv,
            codeTag: tag,
            obfuscator
        }
    });
};

// ─── Script Updates ────────────────────────────────────

export const updateScriptCode = async (scriptId, code) => {
    const { encrypted, iv, tag } = encryptCode(code);
    return prisma.script.update({
        where: { scriptId },
        data: { code: encrypted, codeIv: iv, codeTag: tag }
    });
};

export const updateScriptName = async (scriptId, name) => {
    return prisma.script.update({ where: { scriptId }, data: { name } });
};

export const toggleScript = async (scriptId) => {
    const script = await prisma.script.findUnique({ where: { scriptId } });
    return prisma.script.update({ where: { scriptId }, data: { isActive: !script.isActive } });
};

export const setScriptActive = async (scriptId, isActive) => {
    return prisma.script.update({ where: { scriptId }, data: { isActive } });
};

// ─── Script Decryption ─────────────────────────────────

export const getDecryptedCode = async (scriptId) => {
    const script = await prisma.script.findUnique({ where: { scriptId } });
    if (!script) return null;
    return decryptCode(script.code, script.codeIv, script.codeTag);
};

// ─── Script Deletion ───────────────────────────────────

export const deleteScript = async (scriptId, hubId) => {
    return prisma.script.delete({ where: { scriptId, hubId } });
};

export const deleteAllScripts = async (hubId) => {
    return prisma.script.deleteMany({ where: { hubId } });
};

// ─── Script Stats ──────────────────────────────────────

export const countScripts = async (hubId) => {
    return prisma.script.count({ where: { hubId } });
};

export const incrementExecutions = async (scriptId) => {
    return prisma.script.update({ where: { scriptId }, data: { executions: { increment: 1 } } });
};
