/**
 * Kymor Rewards Routes — Ad Checkpoint System
 * MySQL/Prisma | Anti-Bypass | Discord Verification
 */
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const router = express.Router();

function getRealIp(req) {
    let ip = req.headers['x-forwarded-for'] || req.ip;
    if (!ip) return 'Unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    return ip;
}

function getKymorSession(req, hubShortId) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`kymor_session_${hubShortId}=([a-zA-Z0-9]+)`));
    return match ? match[1] : null;
}

function notifyOwner(req, hub, eventName, data = null) {
    const io = req.app.get('io');
    if (io && global.activeSockets && hub?.ownerId) {
        const socketId = global.activeSockets.get(hub.ownerId.toString());
        if (socketId) io.to(socketId).emit(eventName, data);
    }
}

// ─── Inventory ─────────────────────────────────────────
router.post('/:hubId/inventory', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    if (!hub || !hub.rewardsEnabled) return res.status(404).json({ error: 'Invalid rewards token.' });

    const ip = getRealIp(req);
    const localKeys = req.body.local_keys || [];
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub.id }, orderBy: { sortOrder: 'asc' } });

    const query = { hubId: hub.id, OR: [{ ipAddress: ip, note: 'Reward Drop' }] };
    if (localKeys.length > 0) query.OR.push({ keyString: { in: localKeys } });
    const keys = await prisma.key.findMany({ where: query, orderBy: { createdAt: 'desc' }, take: 10 });

    res.json({
        hub_name: hub.name, max_keys: hub.rewardsMaxKeys,
        keys: keys.map(k => ({ key: k.keyString, expires_at: k.expiresAt, status: k.status })),
        checkpoints_total: checkpoints.length
    });
});

// ─── Session ───────────────────────────────────────────
router.post('/:hubId/session', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const ip = getRealIp(req);
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub.id }, orderBy: { sortOrder: 'asc' } });
    let sessionId = req.query.session || req.body.session_id || getKymorSession(req, hub.shortId);
    let session = null;

    if (sessionId) session = await prisma.rewardSession.findFirst({ where: { sessionId, hubId: hub.id } });
    if (!session) session = await prisma.rewardSession.findFirst({ where: { ip, hubId: hub.id, expiresAt: { gt: new Date() } }, orderBy: { lastActive: 'desc' } });

    // Expired session cleanup
    if (session && new Date() > session.expiresAt) {
        await prisma.rewardSession.delete({ where: { id: session.id } }).catch(() => {});
        session = null;
    }

    if (!session) {
        sessionId = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + hub.rewardsCheckpointTimeout * 60000);
        let initialProgress = hub.rewardsEnableFreeKeys ? checkpoints.length : 0;

        session = await prisma.rewardSession.create({
            data: { hubId: hub.id, sessionId, ip, expiresAt, progress: initialProgress, usedHashes: [], stepTimes: [], riskScore: 0 }
        });
        notifyOwner(req, hub, 'update_rewards', hub.shortId);
    }

    res.cookie(`kymor_session_${hub.shortId}`, session.sessionId, {
        maxAge: hub.rewardsCheckpointTimeout * 60000, httpOnly: true, path: '/',
        secure: process.env.NODE_ENV === 'production', sameSite: 'Lax'
    });

    // Discord token persistence
    if (req.body.discord_token && !session.discordId && process.env.JWT_SECRET) {
        try {
            const decoded = jwt.verify(req.body.discord_token, process.env.JWT_SECRET);
            await prisma.rewardSession.update({ where: { id: session.id }, data: { discordId: decoded.id, discordUsername: decoded.username } });
            session.discordId = decoded.id;
        } catch (err) {}
    }

    res.json({
        session_id: session.sessionId, progress: session.progress,
        total_steps: checkpoints.length, key_earned: session.keyEarned,
        cooldown_until: session.cooldownUntil, allow_browser_reset: hub.rewardsAllowBrowserReset,
        requires_verification: session.requiresVerification, discord_linked: !!session.discordId,
        hub_config: { add_time_seconds: hub.rewardsAddTimeSecs, max_time_seconds: hub.rewardsMaxTimeSecs }
    });
});

// ─── Reset Session ─────────────────────────────────────
router.post('/:hubId/reset-session', async (req, res) => {
    try {
        const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
        if (!hub) return res.status(404).json({ error: 'Hub not found' });

        const ip = getRealIp(req);
        const sessionId = req.body.session_id || getKymorSession(req, hub.shortId);

        const activeCooldown = await prisma.rewardSession.findFirst({
            where: { hubId: hub.id, cooldownUntil: { gt: new Date() }, OR: [{ sessionId: sessionId || '' }, { ip }] }
        });
        if (activeCooldown) return res.status(403).json({ error: 'Cannot reset during cooldown.' });

        await prisma.rewardSession.deleteMany({ where: { hubId: hub.id, OR: [{ sessionId: sessionId || '' }, { ip }] } });
        res.clearCookie(`kymor_session_${hub.shortId}`);
        notifyOwner(req, hub, 'update_rewards', hub.shortId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Reset failed' }); }
});

// ─── Step (Get Link) ──────────────────────────────────
router.get('/:hubId/step/:sessionId', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    const session = await prisma.rewardSession.findFirst({ where: { sessionId: req.params.sessionId } });
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub?.id || '' }, orderBy: { sortOrder: 'asc' } });

    if (!hub || !session || session.progress >= checkpoints.length) return res.status(400).json({ error: 'Invalid session.' });
    if (session.cooldownUntil && session.cooldownUntil > new Date()) return res.status(403).json({ error: 'Cooldown active.' });

    const step = checkpoints[session.progress];
    const actionToken = crypto.randomBytes(16).toString('hex');
    await prisma.rewardSession.update({ where: { id: session.id }, data: { stepStartedAt: new Date(), actionToken, lastActive: new Date() } });

    const host = req.get('host');
    const postbackUrl = `${req.protocol}://${host}/api/rewards/${hub.shortId}/postback/${step.provider.toLowerCase()}?sessionId=${session.sessionId}&token=${actionToken}`;

    if (step.provider === 'LOOTLABS' && step.apiToken) {
        try {
            const lootRes = await fetch('https://api.lootlabs.gg/v1/url_encryptor', {
                method: 'POST', headers: { 'Authorization': `Bearer ${step.apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: postbackUrl })
            });
            const data = await lootRes.json();
            if (data?.url) return res.json({ url: data.url });
        } catch (err) {}
    }
    res.json({ url: step.shortUrl });
});

// ─── Postback (Checkpoint Completion) ─────────────────
router.get('/:hubId/postback/:provider', async (req, res) => {
    const { hubId, provider } = req.params;
    const { sessionId } = req.query;
    const fallbackSessionId = req.query.session || req.query.s || req.query.custom || sessionId || getKymorSession(req, hubId);

    const hub = await prisma.hub.findUnique({ where: { shortId: hubId } });
    let session = null;
    if (fallbackSessionId) session = await prisma.rewardSession.findFirst({ where: { sessionId: fallbackSessionId, hubId: hub?.id || '' } });
    if (!session) session = await prisma.rewardSession.findFirst({ where: { ip: getRealIp(req), hubId: hub?.id || '', expiresAt: { gt: new Date() } }, orderBy: { lastActive: 'desc' } });

    if (!session || !hub) return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?error=${encodeURIComponent('Session expired.')}`);
    if (session.cooldownUntil && session.cooldownUntil > new Date()) return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?error=${encodeURIComponent('Cooldown active.')}`);

    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub.id }, orderBy: { sortOrder: 'asc' } });
    const currentStep = checkpoints[session.progress];

    if (currentStep && currentStep.provider.toLowerCase().replace('_', '') === provider.toLowerCase().replace('.', '')) {
        if (!session.stepStartedAt) return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?session=${session.sessionId}&error=${encodeURIComponent('Step not initialized.')}`);

        const timeTaken = (Date.now() - session.stepStartedAt.getTime()) / 1000;
        let addedRisk = 0;
        let isValid = false;

        if (timeTaken < 10) addedRisk += 60;

        if (provider.toLowerCase() === 'lootlabs') {
            if (!req.query.token || session.actionToken !== req.query.token) addedRisk += 100;
            else isValid = true;
        } else if (provider.toLowerCase() === 'linkvertise') {
            const hash = req.query.hash;
            const usedHashes = (session.usedHashes || []);
            if (!hash) addedRisk += 100;
            else if (usedHashes.includes(hash)) addedRisk += 100;
            else if (currentStep.apiToken) {
                try {
                    const lvRes = await fetch(`https://publisher.linkvertise.com/api/v1/anti_bypassing?token=${currentStep.apiToken}&hash=${hash}`, { method: 'POST' });
                    const data = await lvRes.json();
                    if (data.status !== true) addedRisk += 100;
                    else { usedHashes.push(hash); isValid = true; }
                } catch (err) { return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?session=${session.sessionId}&error=${encodeURIComponent('API Error.')}`); }
            } else { if (addedRisk === 0) isValid = true; }
        } else {
            isValid = true; // work.ink, shrtfly — basic validation
        }

        if (addedRisk > 0 || !isValid) {
            const newRisk = session.riskScore + (addedRisk || 50);
            const updateData = { riskScore: newRisk, stepStartedAt: null };
            if (newRisk >= 100) updateData.requiresVerification = true;
            await prisma.rewardSession.update({ where: { id: session.id }, data: updateData });
            const msg = newRisk >= 100 ? 'Security Check Required.' : 'Step validation failed.';
            return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?session=${session.sessionId}&error=${encodeURIComponent(msg)}`);
        }

        const stepTimes = [...(session.stepTimes || []), timeTaken];
        const usedHashes = provider.toLowerCase() === 'linkvertise' ? (session.usedHashes || []) : session.usedHashes;

        await prisma.rewardSession.update({
            where: { id: session.id },
            data: {
                progress: session.progress + 1, actionToken: null, stepStartedAt: null,
                lastActive: new Date(), stepTimes, usedHashes,
                expiresAt: new Date(Date.now() + hub.rewardsCheckpointTimeout * 60000),
                riskScore: Math.max(0, session.riskScore - 10)
            }
        });

        // Update checkpoint completed count
        await prisma.checkpoint.update({ where: { id: currentStep.id }, data: { completedCount: { increment: 1 } } });
        notifyOwner(req, hub, 'update_rewards', hub.shortId);
    }

    return res.redirect(`${req.protocol}://${req.get('host')}/reward/${hubId}?session=${session.sessionId}`);
});

// ─── Claim Key ─────────────────────────────────────────
router.post('/:hubId/claim', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    const session = await prisma.rewardSession.findFirst({ where: { sessionId: req.body.session_id } });
    const ip = getRealIp(req);
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub?.id || '' } });

    if (session?.cooldownUntil && new Date() < session.cooldownUntil) return res.status(403).json({ error: 'Cooldown active.', cooldown_until: session.cooldownUntil });
    if (!hub || !session || session.progress < checkpoints.length || (checkpoints.length === 0 && !hub.rewardsEnableFreeKeys)) return res.status(400).json({ error: 'Checkpoints not completed.' });
    if (session.requiresVerification && !session.discordId) return res.status(403).json({ error: 'Security Check Required! Link Discord.' });

    const expiresAt = hub.rewardsKeyDurationSecs > 0 ? new Date(Date.now() + hub.rewardsKeyDurationSecs * 1000) : null;
    const keyStr = `KYMOR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    await prisma.key.create({ data: { hubId: hub.id, keyString: keyStr, expiresAt, note: 'Reward Drop', ipAddress: ip, discordId: session.discordId || null } });
    await prisma.hub.update({ where: { id: hub.id }, data: { statsKeys: { increment: 1 } } });

    const cooldownUntil = hub.rewardsCooldownSecs > 0 ? new Date(Date.now() + hub.rewardsCooldownSecs * 1000) : null;
    const sessionExpiry = cooldownUntil ? new Date(cooldownUntil.getTime() + hub.rewardsCheckpointTimeout * 60000) : new Date(Date.now() + hub.rewardsCheckpointTimeout * 60000);

    await prisma.rewardSession.update({
        where: { id: session.id },
        data: { progress: 0, keyEarned: keyStr, usedHashes: [], stepStartedAt: null, actionToken: null, cooldownUntil, expiresAt: sessionExpiry }
    });

    notifyOwner(req, hub, 'update_analytics', hub.shortId);
    notifyOwner(req, hub, 'update_rewards', hub.shortId);
    res.json({ key: keyStr });
});

// ─── Renew Key ─────────────────────────────────────────
router.post('/:hubId/renew', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    const session = await prisma.rewardSession.findFirst({ where: { sessionId: req.body.session_id } });
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub?.id || '' } });
    const { key_string } = req.body;

    if (session?.cooldownUntil && new Date() < session.cooldownUntil) return res.status(403).json({ error: 'Cooldown active.' });
    if (!hub || !session || session.progress < checkpoints.length) return res.status(400).json({ error: 'Checkpoints not completed.' });

    const key = await prisma.key.findFirst({ where: { hubId: hub.id, keyString: key_string } });
    if (!key) return res.status(404).json({ error: 'Key not found.' });
    if (key.status === 'BANNED') return res.status(403).json({ error: 'Cannot renew a banned key.' });

    const expiresAt = hub.rewardsKeyDurationSecs > 0 ? new Date(Date.now() + hub.rewardsKeyDurationSecs * 1000) : null;
    await prisma.key.update({ where: { id: key.id }, data: { expiresAt } });

    const cooldownUntil = hub.rewardsCooldownSecs > 0 ? new Date(Date.now() + hub.rewardsCooldownSecs * 1000) : null;
    await prisma.rewardSession.update({
        where: { id: session.id },
        data: { progress: 0, keyEarned: key_string, usedHashes: [], stepStartedAt: null, actionToken: null, cooldownUntil }
    });

    notifyOwner(req, hub, 'update_rewards', hub.shortId);
    res.json({ success: true, expires_at: expiresAt });
});

// ─── Add Time ──────────────────────────────────────────
router.post('/:hubId/add-time', async (req, res) => {
    const hub = await prisma.hub.findUnique({ where: { shortId: req.params.hubId } });
    const session = await prisma.rewardSession.findFirst({ where: { sessionId: req.body.session_id } });
    const checkpoints = await prisma.checkpoint.findMany({ where: { hubId: hub?.id || '' } });
    const { key_string } = req.body;

    if (!hub || !session || session.progress < checkpoints.length) return res.status(400).json({ error: 'Checkpoints not completed.' });
    if (session?.cooldownUntil && new Date() < session.cooldownUntil) return res.status(403).json({ error: 'Cooldown active.' });

    const key = await prisma.key.findFirst({ where: { hubId: hub.id, keyString: key_string } });
    if (!key) return res.status(404).json({ error: 'Key not found.' });
    if (key.status === 'BANNED') return res.status(403).json({ error: 'Cannot add time to banned key.' });
    if (!key.expiresAt) return res.status(400).json({ error: 'Cannot add time to lifetime key.' });

    const maxDate = new Date(Date.now() + hub.rewardsMaxTimeSecs * 1000);
    let baseTime = Math.max(Date.now(), key.expiresAt.getTime());
    let newExpiresAt = new Date(baseTime + hub.rewardsAddTimeSecs * 1000);
    if (newExpiresAt > maxDate) {
        if (key.expiresAt >= maxDate) return res.status(403).json({ error: 'Max time reached.' });
        newExpiresAt = maxDate;
    }

    await prisma.key.update({ where: { id: key.id }, data: { expiresAt: newExpiresAt } });

    const cooldownUntil = hub.rewardsCooldownSecs > 0 ? new Date(Date.now() + hub.rewardsCooldownSecs * 1000) : null;
    await prisma.rewardSession.update({ where: { id: session.id }, data: { progress: 0, keyEarned: key_string, usedHashes: [], cooldownUntil } });

    notifyOwner(req, hub, 'update_rewards', hub.shortId);
    res.json({ success: true, expires_at: newExpiresAt });
});

// ─── Discord OAuth ─────────────────────────────────────
router.get('/:hubId/discord/login', (req, res) => {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) return res.status(500).send('Discord OAuth not configured.');
    const { sessionId } = req.query;
    const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/rewards/discord/callback`);
    const state = Buffer.from(JSON.stringify({ hubId: req.params.hubId, sessionId })).toString('base64');
    res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`);
});

router.get('/discord/callback', async (req, res) => {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.JWT_SECRET) return res.status(500).send('Config error.');
    const { code, state } = req.query;
    if (!code || !state) return res.send('Invalid request.');

    try {
        const { hubId, sessionId } = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
        const redirectUri = `${req.protocol}://${req.get('host')}/api/rewards/discord/callback`;
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST', body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error('Token failed');

        const userRes = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` } });
        const userData = await userRes.json();

        if (userData.id) {
            await prisma.rewardSession.updateMany({
                where: { sessionId }, data: { discordId: userData.id, discordUsername: userData.username, requiresVerification: false, riskScore: 0 }
            });
            const persistentToken = jwt.sign({ id: userData.id, username: userData.username }, process.env.JWT_SECRET, { expiresIn: '365d' });
            return res.redirect(`/reward/${hubId}?session=${sessionId}&dt=${persistentToken}`);
        }
        res.redirect(`/reward/${hubId}?session=${sessionId}`);
    } catch (err) { res.status(500).send('Discord auth failed.'); }
});

export default router;