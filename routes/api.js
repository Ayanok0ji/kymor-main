/**
 * Kymor API Routes — Hub, Key, Script Management
 * MySQL/Prisma | Encrypted Script Storage
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { encryptCode, decryptCode, generateShortId, generateKeyString, generateToken } from '../lib/crypto.js';
import { sendMail, generateEmailHtml } from '../utils/mailer.js';

const router = express.Router();

// ─── Auth Middleware ───────────────────────────────────
const requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies.kymor_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ error: 'User not found.' });
        req.user = user;
        next();
    } catch (err) { res.status(401).json({ error: 'Invalid session.' }); }
};

router.use(requireAuth);

// ─── Hub CRUD ──────────────────────────────────────────
router.get('/hubs', async (req, res) => {
    try {
        const hubs = await prisma.hub.findMany({
            where: { ownerId: req.user.id },
            include: {
                scripts: { select: { id: true, scriptId: true, name: true, executions: true, isActive: true, createdAt: true } },
                checkpoints: { orderBy: { sortOrder: 'asc' } },
                _count: { select: { keys: true, executionLogs: true, playerSessions: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Add online count
        const result = hubs.map(hub => ({
            ...hub,
            stats: {
                online: hub._count.playerSessions,
                executions: hub.statsExecutions,
                scripts: hub.scripts.length,
                keys: hub._count.keys
            }
        }));

        res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to load hubs.' }); }
});

router.post('/hubs', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.length < 2) return res.status(400).json({ error: 'Hub name required (min 2 chars).' });

        const maxHubs = req.user.isPremium ? 10 : 3;
        const count = await prisma.hub.count({ where: { ownerId: req.user.id } });
        if (count >= maxHubs) return res.status(403).json({ error: `Hub limit reached (${maxHubs}).` });

        const hub = await prisma.hub.create({
            data: {
                ownerId: req.user.id,
                name,
                shortId: generateShortId(4),
                apiKey: generateToken(16),
                webhookUrl: ''
            }
        });

        res.json(hub);
    } catch (err) { res.status(500).json({ error: 'Failed to create hub.' }); }
});

router.put('/hubs/:shortId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { name, webhookUrl, paused } = req.body;
        const updated = await prisma.hub.update({
            where: { id: hub.id },
            data: {
                ...(name !== undefined && { name }),
                ...(webhookUrl !== undefined && { webhookUrl }),
                ...(paused !== undefined && { paused })
            }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: 'Update failed.' }); }
});

router.delete('/hubs/:shortId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.hub.delete({ where: { id: hub.id } }); // Cascade deletes keys, scripts, etc.
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed.' }); }
});

// ─── Rewards Config ────────────────────────────────────
router.put('/hubs/:shortId/rewards', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const d = req.body;
        const updated = await prisma.hub.update({
            where: { id: hub.id },
            data: {
                ...(d.enabled !== undefined && { rewardsEnabled: d.enabled }),
                ...(d.max_keys !== undefined && { rewardsMaxKeys: d.max_keys }),
                ...(d.enable_free_keys !== undefined && { rewardsEnableFreeKeys: d.enable_free_keys }),
                ...(d.key_duration_seconds !== undefined && { rewardsKeyDurationSecs: d.key_duration_seconds }),
                ...(d.add_time_seconds !== undefined && { rewardsAddTimeSecs: d.add_time_seconds }),
                ...(d.max_time_seconds !== undefined && { rewardsMaxTimeSecs: d.max_time_seconds }),
                ...(d.cooldown_seconds !== undefined && { rewardsCooldownSecs: d.cooldown_seconds }),
                ...(d.checkpoint_timeout_mins !== undefined && { rewardsCheckpointTimeout: d.checkpoint_timeout_mins }),
                ...(d.allow_browser_reset !== undefined && { rewardsAllowBrowserReset: d.allow_browser_reset }),
                ...(d.require_discord !== undefined && { rewardsRequireDiscord: d.require_discord }),
            }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: 'Failed to update rewards.' }); }
});

// ─── Checkpoints (Ad Steps) ───────────────────────────
router.post('/hubs/:shortId/checkpoints', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { provider, short_url, api_token } = req.body;
        if (!provider || !short_url) return res.status(400).json({ error: 'Provider and URL required.' });

        const count = await prisma.checkpoint.count({ where: { hubId: hub.id } });
        const cp = await prisma.checkpoint.create({
            data: { hubId: hub.id, provider, shortUrl: short_url, apiToken: api_token || '', sortOrder: count }
        });
        res.json(cp);
    } catch (err) { res.status(500).json({ error: 'Failed to add checkpoint.' }); }
});

router.delete('/hubs/:shortId/checkpoints/:cpId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.checkpoint.delete({ where: { id: req.params.cpId, hubId: hub.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed.' }); }
});

// ─── Keys ──────────────────────────────────────────────
router.get('/hubs/:shortId/keys', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        const keys = await prisma.key.findMany({ where: { hubId: hub.id }, orderBy: { createdAt: 'desc' }, take: 500 });
        res.json(keys);
    } catch (err) { res.status(500).json({ error: 'Failed to load keys.' }); }
});

router.post('/hubs/:shortId/keys', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { amount = 1, duration_hours, note, non_hwid, bound_script_id } = req.body;
        const count = Math.min(parseInt(amount) || 1, 50);

        const keys = [];
        for (let i = 0; i < count; i++) {
            keys.push({
                hubId: hub.id,
                keyString: generateKeyString(req.user.isPremium),
                expiresAt: duration_hours ? new Date(Date.now() + duration_hours * 3600000) : null,
                note: note || '',
                nonHwid: non_hwid || false,
                boundScriptId: bound_script_id || null
            });
        }

        await prisma.key.createMany({ data: keys });
        await prisma.hub.update({ where: { id: hub.id }, data: { statsKeys: { increment: count } } });

        const io = req.app.get('io');
        const socketId = global.activeSockets?.get(req.user.id.toString());
        if (socketId) io?.to(socketId).emit('update_analytics', hub.shortId);

        res.json({ success: true, count });
    } catch (err) { res.status(500).json({ error: 'Key generation failed.' }); }
});

router.put('/hubs/:shortId/keys/:keyId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { status, note, hwid } = req.body;
        const updated = await prisma.key.update({
            where: { id: req.params.keyId, hubId: hub.id },
            data: {
                ...(status !== undefined && { status }),
                ...(note !== undefined && { note }),
                ...(hwid !== undefined && { hwid })
            }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: 'Update failed.' }); }
});

router.post('/hubs/:shortId/keys/:keyId/reset-hwid', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        await prisma.key.update({
            where: { id: req.params.keyId, hubId: hub.id },
            data: { hwid: null, lastHwidReset: new Date() }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Reset failed.' }); }
});

router.delete('/hubs/:shortId/keys/:keyId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.key.delete({ where: { id: req.params.keyId, hubId: hub.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed.' }); }
});

router.delete('/hubs/:shortId/keys', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.key.deleteMany({ where: { hubId: hub.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete all failed.' }); }
});

// ─── Scripts (Encrypted Storage) ───────────────────────
router.get('/hubs/:shortId/scripts', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        const scripts = await prisma.script.findMany({
            where: { hubId: hub.id },
            select: { id: true, scriptId: true, name: true, executions: true, isActive: true, obfuscator: true, createdAt: true }
        });
        res.json(scripts);
    } catch (err) { res.status(500).json({ error: 'Failed to load scripts.' }); }
});

router.post('/hubs/:shortId/scripts', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { name, code } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Name and code required.' });

        const maxScripts = req.user.isPremium ? 20 : 5;
        const scriptCount = await prisma.script.count({ where: { hubId: hub.id } });
        if (scriptCount >= maxScripts) return res.status(403).json({ error: `Script limit reached (${maxScripts}).` });

        // Encrypt script code before storing
        const { encrypted, iv, tag } = encryptCode(code);

        const script = await prisma.script.create({
            data: {
                hubId: hub.id,
                scriptId: generateShortId(6),
                name,
                code: encrypted,
                codeIv: iv,
                codeTag: tag
            }
        });

        await prisma.hub.update({ where: { id: hub.id }, data: { statsScripts: { increment: 1 } } });

        res.json({ id: script.id, scriptId: script.scriptId, name: script.name, isActive: script.isActive });
    } catch (err) { res.status(500).json({ error: 'Script creation failed.' }); }
});

router.put('/hubs/:shortId/scripts/:scriptId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const { name, code, isActive } = req.body;
        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (code !== undefined) {
            const { encrypted, iv, tag } = encryptCode(code);
            updateData.code = encrypted;
            updateData.codeIv = iv;
            updateData.codeTag = tag;
        }

        const script = await prisma.script.update({
            where: { scriptId: req.params.scriptId, hubId: hub.id },
            data: updateData
        });

        res.json({ id: script.id, scriptId: script.scriptId, name: script.name, isActive: script.isActive });
    } catch (err) { res.status(500).json({ error: 'Update failed.' }); }
});

router.get('/hubs/:shortId/scripts/:scriptId/code', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const script = await prisma.script.findFirst({ where: { scriptId: req.params.scriptId, hubId: hub.id } });
        if (!script) return res.status(404).json({ error: 'Script not found.' });

        const code = decryptCode(script.code, script.codeIv, script.codeTag);
        res.json({ code });
    } catch (err) { res.status(500).json({ error: 'Failed to retrieve code.' }); }
});

router.delete('/hubs/:shortId/scripts/:scriptId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.script.delete({ where: { scriptId: req.params.scriptId, hubId: hub.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed.' }); }
});

// ─── Analytics ─────────────────────────────────────────
router.get('/hubs/:shortId/analytics', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const [logs, players] = await Promise.all([
            prisma.executionLog.findMany({ where: { hubId: hub.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
            prisma.playerSession.findMany({ where: { hubId: hub.id }, orderBy: { lastPing: 'desc' } })
        ]);

        res.json({ executions: logs, online: players });
    } catch (err) { res.status(500).json({ error: 'Failed to load analytics.' }); }
});

// ─── Blacklist ─────────────────────────────────────────
router.get('/hubs/:shortId/blacklist', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        const bans = await prisma.blacklist.findMany({ where: { hubId: hub.id }, orderBy: { createdAt: 'desc' } });
        res.json(bans);
    } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/hubs/:shortId/blacklist', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        const { target, reason } = req.body;
        if (!target) return res.status(400).json({ error: 'Target required.' });
        const ban = await prisma.blacklist.create({ data: { hubId: hub.id, target, reason: reason || 'Manual ban' } });
        res.json(ban);
    } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/hubs/:shortId/blacklist/:banId', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        await prisma.blacklist.delete({ where: { id: req.params.banId, hubId: hub.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed.' }); }
});

// ─── Reward Sessions (Admin View) ─────────────────────
router.get('/hubs/:shortId/reward-sessions', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });
        const sessions = await prisma.rewardSession.findMany({
            where: { hubId: hub.id }, orderBy: { lastActive: 'desc' }, take: 50
        });
        res.json(sessions);
    } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

// ─── Page Builder ──────────────────────────────────────
router.put('/hubs/:shortId/page', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({ where: { shortId: req.params.shortId, ownerId: req.user.id } });
        if (!hub) return res.status(404).json({ error: 'Hub not found.' });

        const d = req.body;
        const updated = await prisma.hub.update({
            where: { id: hub.id },
            data: {
                ...(d.published !== undefined && { pagePublished: d.published }),
                ...(d.title !== undefined && { pageTitle: d.title }),
                ...(d.slug !== undefined && { pageSlug: d.slug }),
                ...(d.key_mode !== undefined && { pageKeyMode: d.key_mode }),
                ...(d.buy_link !== undefined && { pageBuyLink: d.buy_link }),
                ...(d.accent_color !== undefined && { pageAccentColor: d.accent_color }),
                ...(d.description !== undefined && { pageDescription: d.description }),
                ...(d.elements !== undefined && { pageElements: d.elements }),
            }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: 'Page update failed.' }); }
});

// ─── Premium Key Redemption ────────────────────────────
router.post('/redeem-premium', async (req, res) => {
    try {
        const { key_string } = req.body;
        if (!key_string) return res.status(400).json({ error: 'Key required.' });

        const premKey = await prisma.premiumKey.findUnique({ where: { keyString: key_string } });
        if (!premKey) return res.status(404).json({ error: 'Invalid key.' });
        if (premKey.used) return res.status(400).json({ error: 'Key already redeemed.' });

        await prisma.$transaction([
            prisma.premiumKey.update({
                where: { id: premKey.id },
                data: { used: true, usedById: req.user.id, usedAt: new Date() }
            }),
            prisma.user.update({
                where: { id: req.user.id },
                data: { isPremium: true }
            })
        ]);

        await prisma.globalActivityLog.create({
            data: { action: 'REDEEM_PREMIUM', username: req.user.username, details: `Redeemed key ${key_string.substring(0, 10)}...` }
        });

        res.json({ success: true, message: 'Premium activated!' });
    } catch (err) { res.status(500).json({ error: 'Redemption failed.' }); }
});

// ─── PayPal Payment ────────────────────────────────────
router.post('/payments/paypal-success', async (req, res) => {
    try {
        const { orderID } = req.body;
        if (!orderID) return res.status(400).json({ error: 'Missing Order ID.' });

        const config = await prisma.platformConfig.findFirst();
        if (!config?.paypalClientId || !config?.paypalClientSecret) return res.status(500).json({ error: 'PayPal not configured.' });

        const auth = Buffer.from(`${config.paypalClientId}:${config.paypalClientSecret}`).toString('base64');
        const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
            method: 'POST', body: 'grant_type=client_credentials',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.status(400).json({ error: 'Auth failed.' });

        const orderRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const orderData = await orderRes.json();

        if (orderData.status === 'COMPLETED') {
            const keyStr = `KYMOR-PREM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
            await prisma.premiumKey.create({ data: { keyString: keyStr, purchasedById: req.user.id, note: `PayPal: ${orderID}` } });

            await prisma.globalActivityLog.create({
                data: { action: 'PAYMENT_RECEIVED', username: req.user.username, details: `PayPal Order ${orderID}.` }
            });

            const emailHtml = generateEmailHtml({
                type: 'receipt', title: 'Your Premium Key is Here',
                subtitle: 'Your transaction has been securely processed.',
                orderId: orderID, date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                method: 'PayPal', amount: `$${orderData.purchase_units[0].amount.value} ${orderData.purchase_units[0].amount.currency_code}`,
                premiumKey: keyStr, footerText: 'Redeem your key from the dashboard Upgrade tab.'
            });

            sendMail({ from: '"Kymor Billing" <noreply@kymor.dev>', to: req.user.email, subject: 'Your Kymor Premium Key & Receipt', html: emailHtml }).catch(() => {});
            return res.json({ success: true });
        }
        res.status(400).json({ error: 'Payment not completed.' });
    } catch (err) { res.status(500).json({ error: 'Verification failed.' }); }
});

router.get('/user/gift-keys', async (req, res) => {
    try {
        const keys = await prisma.premiumKey.findMany({ where: { purchasedById: req.user.id }, orderBy: { createdAt: 'desc' } });
        res.json(keys);
    } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

export default router;