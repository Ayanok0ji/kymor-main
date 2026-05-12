/**
 * Kymor Roblox Routes — SDK Authentication & Key Validation
 * MySQL/Prisma | HMAC Signature Verification | Anti-Replay Tokens
 */
import express from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { decryptCode, verifyHmacSignature, generateToken, sha256 } from '../lib/crypto.js';
import honeypotMiddleware from '../middleware/honeypot.js';

const router = express.Router();

// ─── Helpers ───────────────────────────────────────────
function getRealIp(req) {
    let ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
    if (!ip) return 'Unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    return ip;
}

function decodePayload(raw) {
    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
        return JSON.parse(decoded);
    } catch (e) { return null; }
}

// ─── Blacklist Check Middleware ─────────────────────────
async function checkBlacklist(req, res, next) {
    try {
        const ip = getRealIp(req);
        let payload = null;
        if (req.body?.payload) payload = decodePayload(req.body.payload);

        const targets = [ip];
        if (payload?.hwid) targets.push(payload.hwid);

        const ban = await prisma.blacklist.findFirst({
            where: { target: { in: targets } }
        });

        if (ban) {
            return res.status(403).json({
                code: 'BLACKLISTED',
                message: `Blacklisted: ${ban.reason}`
            });
        }
        next();
    } catch (e) { next(); }
}

// ─── Security headers check ───────────────────────────
function validateSecurityHeaders(req, res, next) {
    const kymorSecurity = req.headers['x-kymor-sdk'];
    if (!kymorSecurity || kymorSecurity !== 'KymorSecureStream/v5') {
        return res.status(403).json({
            code: 'INVALID_CLIENT',
            message: 'Unauthorized client. Please use the official Kymor SDK.'
        });
    }
    next();
}

// ─── Honeypot Trap (from Panda) ────────────────────────
router.post('/auth/bypass', honeypotMiddleware, (req, res) => {
    res.status(200).json({ code: 'KEY_VALID', token: 'granted', message: 'Access granted.' });
});

router.get('/auth/bypass', honeypotMiddleware, (req, res) => {
    res.status(200).json({ code: 'KEY_VALID', token: 'granted' });
});

router.post('/v1/auth/bypass', honeypotMiddleware, (req, res) => {
    res.json({ code: 'KEY_VALID', token: 'granted' });
});

// ─── Key Authentication ────────────────────────────────
router.post('/auth', validateSecurityHeaders, checkBlacklist, async (req, res) => {
    try {
        const { payload, signature } = req.body;
        if (!payload) return res.status(400).json({ code: 'ERROR', message: 'No payload.' });

        const data = decodePayload(payload);
        if (!data || !data.key || !data.script_id) {
            return res.status(400).json({ code: 'KEY_INCORRECT', message: 'Invalid request format.' });
        }

        const { key, hwid, script_id, executor, country, lat, lon, ip: clientIp, region, city, user_id, job_id } = data;

        // Find the script and its hub
        const script = await prisma.script.findUnique({
            where: { scriptId: script_id },
            include: { hub: true }
        });

        if (!script || !script.hub) {
            return res.status(404).json({ code: 'KEY_INCORRECT', message: 'Script not found.' });
        }

        const hub = script.hub;

        if (hub.paused || !script.isActive) {
            return res.status(410).json({ code: 'KEY_INCORRECT', message: 'This script has been disabled by the developer.' });
        }

        // Verify HMAC signature if hub has an API key (enhanced security)
        if (signature && hub.apiKey) {
            const isValid = verifyHmacSignature(payload, signature, hub.apiKey);
            if (!isValid) {
                return res.status(403).json({ code: 'INVALID_SIGNATURE', message: 'Request signature mismatch.' });
            }
        }

        // Find the key
        const keyRecord = await prisma.key.findUnique({ where: { keyString: key } });

        if (!keyRecord || keyRecord.hubId !== hub.id) {
            return res.status(401).json({ code: 'KEY_INCORRECT', message: 'License key not found.' });
        }

        if (keyRecord.status === 'BANNED') {
            return res.status(403).json({ code: 'KEY_INCORRECT', message: 'This key has been banned.' });
        }

        // Check expiry
        if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
            return res.status(401).json({ code: 'KEY_EXPIRED', message: 'This key has expired.' });
        }

        // Check HWID binding
        if (!keyRecord.nonHwid && hwid) {
            if (keyRecord.hwid && keyRecord.hwid !== hwid) {
                return res.status(403).json({
                    code: 'HWID_MISMATCH',
                    message: 'Hardware mismatch. This key is bound to another device.'
                });
            }

            // Bind HWID on first use
            if (!keyRecord.hwid) {
                await prisma.key.update({
                    where: { id: keyRecord.id },
                    data: { hwid, ipAddress: getRealIp(req) }
                });
            }
        }

        // Check script binding
        if (keyRecord.boundScriptId && keyRecord.boundScriptId !== script_id) {
            return res.status(403).json({
                code: 'KEY_INCORRECT',
                message: 'This key is bound to a different script.'
            });
        }

        // Generate one-time session token for script fetch
        const sessionToken = generateToken(32);
        const expiresAt = new Date(Date.now() + 30 * 1000); // 30 second TTL

        await prisma.session.create({
            data: {
                token: sessionToken,
                scriptId: script_id,
                expiresAt,
                used: false
            }
        });

        // Increment executions
        await Promise.all([
            prisma.key.update({ where: { id: keyRecord.id }, data: { executions: { increment: 1 } } }),
            prisma.script.update({ where: { id: script.id }, data: { executions: { increment: 1 } } }),
            prisma.hub.update({ where: { id: hub.id }, data: { statsExecutions: { increment: 1 } } }),
        ]);

        // Log execution
        await prisma.executionLog.create({
            data: {
                hubId: hub.id,
                scriptId: script_id,
                scriptName: script.name,
                keyString: key,
                executor: executor || 'Unknown',
                hwid: hwid || 'Unknown',
                country: country || 'Unknown',
                lat: lat || 0,
                lon: lon || 0,
                ipAddress: getRealIp(req)
            }
        });

        // Notify owner via WebSocket
        const io = req.app.get('io');
        if (io && global.activeSockets) {
            const socketId = global.activeSockets.get(hub.ownerId.toString());
            if (socketId) {
                io.to(socketId).emit('update_analytics', hub.shortId);
            }
        }

        // Webhook notification
        if (hub.webhookUrl) {
            fetch(hub.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'key_auth',
                    key: key.substring(0, 8) + '...',
                    script: script.name,
                    executor,
                    country,
                    timestamp: new Date().toISOString()
                })
            }).catch(() => {});
        }

        return res.json({
            code: 'KEY_VALID',
            message: 'Authenticated.',
            token: sessionToken,
            data: {
                hub_id: hub.shortId,
                discord_id: keyRecord.discordId,
                key_expiry: keyRecord.expiresAt,
                note: keyRecord.note,
                is_premium: keyRecord.isTrial === false
            }
        });

    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ code: 'ERROR', message: 'Server error.' });
    }
});

// ─── Script Fetch (One-Time Token) ─────────────────────
router.get('/fetch', validateSecurityHeaders, async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send("game.Players.LocalPlayer:Kick('Kymor: Missing session token.')");

        const session = await prisma.session.findUnique({ where: { token } });

        if (!session || session.used || new Date() > session.expiresAt) {
            // Invalidate used/expired sessions
            if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
            return res.status(403).send("game.Players.LocalPlayer:Kick('Kymor: Session expired or already used.')");
        }

        // Mark as used immediately (anti-replay)
        await prisma.session.update({ where: { id: session.id }, data: { used: true } });

        const script = await prisma.script.findUnique({ where: { scriptId: session.scriptId } });

        if (!script || !script.isActive) {
            return res.status(410).send("game.Players.LocalPlayer:Kick('Kymor: Script disabled.')");
        }

        // Decrypt the script code
        const code = decryptCode(script.code, script.codeIv, script.codeTag);

        // Delete the session after successful fetch
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});

        res.type('text/plain').send(code);
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).send("game.Players.LocalPlayer:Kick('Kymor: Server error.')");
    }
});

// ─── Player Ping (Heartbeat) ───────────────────────────
router.post('/ping', validateSecurityHeaders, async (req, res) => {
    try {
        const { payload } = req.body;
        if (!payload) return res.status(400).end();

        const data = decodePayload(payload);
        if (!data || !data.hub_id || !data.hwid) return res.status(400).end();

        const { hub_id, hwid, executor, player_name, game_name, platform, ping, discord_id } = data;

        const hub = await prisma.hub.findUnique({ where: { shortId: hub_id } });
        if (!hub) return res.status(404).end();

        const ip = getRealIp(req);

        // Upsert player session
        const existing = await prisma.playerSession.findFirst({
            where: { hubId: hub.id, hwid }
        });

        if (existing) {
            await prisma.playerSession.update({
                where: { id: existing.id },
                data: {
                    lastPing: new Date(),
                    playerName: player_name || existing.playerName,
                    gameName: game_name || existing.gameName,
                    executor: executor || existing.executor,
                    ipAddress: ip,
                    discordId: discord_id || existing.discordId
                }
            });
        } else {
            await prisma.playerSession.create({
                data: {
                    hubId: hub.id,
                    hwid,
                    discordId: discord_id || null,
                    playerName: player_name || 'Unknown',
                    executor: executor || 'Unknown',
                    gameName: game_name || 'Unknown Game',
                    ipAddress: ip
                }
            });
        }

        res.status(200).end();
    } catch (err) {
        res.status(500).end();
    }
});

// ─── Cleanup stale sessions (60s timeout) ──────────────
setInterval(async () => {
    try {
        const cutoff = new Date(Date.now() - 60 * 1000);
        await prisma.playerSession.deleteMany({
            where: { lastPing: { lt: cutoff } }
        });
        // Also clean expired sessions
        await prisma.session.deleteMany({
            where: { expiresAt: { lt: new Date() } }
        });
    } catch (e) {}
}, 30000);

export default router;