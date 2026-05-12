/**
 * Kymor Admin Routes — Platform Administration
 * MySQL/Prisma | Role-based Access | 2FA Required
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { sendMail, generateEmailHtml } from '../utils/mailer.js';

const router = express.Router();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const SENDER_EMAIL = process.env.EMAIL_USER || 'noreply@kymor.dev';

// ─── Privileged Access Middleware ─────────────────────
const requirePrivileged = (requiredRole) => async (req, res, next) => {
    try {
        const token = req.cookies.kymor_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ error: 'User not found' });

        const roles = ['USER', 'MODERATOR', 'ADMIN'];
        if (roles.indexOf(user.role) < roles.indexOf(requiredRole)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        if (!user.isTwoFactorEnabled) {
            return res.status(403).json({ error: 'Security Policy: Staff must enable 2FA.' });
        }

        req.adminUser = user;
        next();
    } catch (err) { res.status(401).json({ error: 'Invalid session' }); }
};

const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many attempts. Terminal locked.' } });

// ─── Admin Login (with OTP) ───────────────────────────
router.post('/login', adminLoginLimiter, async (req, res) => {
    try {
        const identifier = req.body.identifier || req.body.username;
        const password = req.body.password;
        if (!identifier || !password) return res.status(400).json({ error: 'Credentials required.' });

        const user = await prisma.user.findFirst({
            where: { OR: [
                { username: { equals: identifier.trim(), mode: 'insensitive' } },
                { email: { equals: identifier.trim(), mode: 'insensitive' } }
            ]}
        });

        if (!user || !['ADMIN', 'MODERATOR'].includes(user.role) || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid Credentials or Unauthorized.' });
        }

        const otp = generateOTP();
        const salt = await bcrypt.genSalt(10);
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorOtp: await bcrypt.hash(otp, salt), twoFactorOtpExpire: new Date(Date.now() + 10 * 60 * 1000) }
        });

        const emailHtml = generateEmailHtml({
            type: 'otp', title: 'Admin Terminal Access',
            subtitle: 'A request was made to unlock the Master Control Panel.',
            otpCode: otp, footerText: "If this wasn't you, your master password is compromised."
        });

        sendMail({ from: `"Security" <${SENDER_EMAIL}>`, to: user.email, subject: 'Admin Terminal 2FA', html: emailHtml }).catch(() => {});
        return res.json({ requires_otp: true, userId: user.id, message: 'Code sent to email.' });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/resend-otp', adminLoginLimiter, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing user ID.' });
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !['ADMIN', 'MODERATOR'].includes(user.role)) return res.status(400).json({ error: 'Invalid.' });

        const otp = generateOTP();
        const salt = await bcrypt.genSalt(10);
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorOtp: await bcrypt.hash(otp, salt), twoFactorOtpExpire: new Date(Date.now() + 10 * 60 * 1000) }
        });

        const emailHtml = generateEmailHtml({ type: 'otp', title: 'Admin Terminal Access', subtitle: 'New code requested.', otpCode: otp, footerText: "If this wasn't you, your credentials are compromised." });
        sendMail({ from: `"Security" <${SENDER_EMAIL}>`, to: user.email, subject: 'Admin Terminal 2FA', html: emailHtml }).catch(() => {});
        res.json({ success: true, message: 'New code sent.' });
    } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { userId, otp } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorOtpExpire || new Date() > user.twoFactorOtpExpire) return res.status(400).json({ error: 'OTP expired.' });
        if (!(await bcrypt.compare(otp, user.twoFactorOtp))) return res.status(400).json({ error: 'Incorrect OTP.' });

        await prisma.user.update({ where: { id: userId }, data: { twoFactorOtp: null, twoFactorOtpExpire: null } });
        res.json({ success: true, role: user.role });
    } catch (err) { res.status(500).json({ error: 'Verification failed.' }); }
});

// ─── Stats ─────────────────────────────────────────────
router.get('/stats', requirePrivileged('MODERATOR'), async (req, res) => {
    try {
        const [totalUsers, premiumUsers, totalHubs, totalExecutions] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isPremium: true } }),
            prisma.hub.count(),
            prisma.executionLog.count()
        ]);
        res.json({ totalUsers, premiumUsers, totalHubs, totalExecutions });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── User Management ──────────────────────────────────
router.get('/users', requirePrivileged('MODERATOR'), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, email: true, role: true, isPremium: true, isVerified: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/premium', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const updated = await prisma.user.update({ where: { id: user.id }, data: { isPremium: !user.isPremium } });
        await prisma.globalActivityLog.create({ data: { action: 'UPDATE_USER', details: `Toggled premium for ${user.username} to ${updated.isPremium}`, username: req.adminUser.username } });
        res.json({ success: true, isPremium: updated.isPremium });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (user) {
            await prisma.user.delete({ where: { id: user.id } }); // Cascade handles hubs/keys/scripts
            await prisma.globalActivityLog.create({ data: { action: 'DELETE_USER', details: `Deleted user ${user.username} and their data.`, username: req.adminUser.username } });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Hub Management ───────────────────────────────────
router.get('/hubs', requirePrivileged('MODERATOR'), async (req, res) => {
    try {
        const hubs = await prisma.hub.findMany({ include: { owner: { select: { username: true, isPremium: true } } }, orderBy: { createdAt: 'desc' } });
        const result = hubs.map(h => ({ ...h, owner_name: h.owner?.username || 'Unknown', owner_premium: h.owner?.isPremium || false }));
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/hubs/:shortId', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const hub = await prisma.hub.findUnique({ where: { shortId: req.params.shortId } });
        if (hub) {
            await prisma.hub.delete({ where: { id: hub.id } });
            await prisma.globalActivityLog.create({ data: { action: 'DELETE_HUB', details: `Admin deleted hub ${hub.name}.`, username: req.adminUser.username } });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Config ──────────────────────────────────
router.get('/config', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const config = await prisma.platformConfig.findFirst();
        res.json({
            discordClientId: config?.discordClientId || '', discordClientSecret: config?.discordClientSecret || '',
            paypalClientId: config?.paypalClientId || '', paypalClientSecret: config?.paypalClientSecret || '',
            paymongoSecretKey: config?.paymongoSecretKey || '', maintenanceMode: config?.maintenanceMode || false
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/config', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const { clientId, clientSecret, paypalClientId, paypalClientSecret, paymongoSecretKey, maintenanceMode } = req.body;
        let config = await prisma.platformConfig.findFirst();
        if (!config) config = await prisma.platformConfig.create({ data: {} });

        await prisma.platformConfig.update({
            where: { id: config.id },
            data: {
                discordClientId: clientId || '', discordClientSecret: clientSecret || '',
                paypalClientId: paypalClientId || '', paypalClientSecret: paypalClientSecret || '',
                paymongoSecretKey: paymongoSecretKey || '', maintenanceMode: maintenanceMode || false
            }
        });

        await prisma.globalActivityLog.create({ data: { action: 'UPDATE_CONFIG', details: `Maintenance: ${maintenanceMode ? 'ON' : 'OFF'}`, username: req.adminUser.username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Activity Logs ────────────────────────────────────
router.get('/activity', requirePrivileged('MODERATOR'), async (req, res) => {
    try {
        const logs = await prisma.globalActivityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/activity/:id', requirePrivileged('ADMIN'), async (req, res) => {
    try { await prisma.globalActivityLog.delete({ where: { id: req.params.id } }); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/activity', requirePrivileged('ADMIN'), async (req, res) => {
    try { await prisma.globalActivityLog.deleteMany({}); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Premium Keys ─────────────────────────────────────
router.get('/premium-keys', requirePrivileged('ADMIN'), async (req, res) => {
    try { res.json(await prisma.premiumKey.findMany({ orderBy: { createdAt: 'desc' } })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/premium-keys/generate', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const amount = Math.min(parseInt(req.body.amount) || 1, 50);
        const keys = Array.from({ length: amount }, () => ({ keyString: `KYMOR-PREM-${crypto.randomBytes(6).toString('hex').toUpperCase()}` }));
        await prisma.premiumKey.createMany({ data: keys });
        await prisma.globalActivityLog.create({ data: { action: 'GENERATE_PREMIUM', details: `Generated ${amount} premium keys.`, username: req.adminUser.username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/premium-keys/:id', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        await prisma.premiumKey.delete({ where: { id: req.params.id } });
        await prisma.globalActivityLog.create({ data: { action: 'DELETE_PREMIUM', details: 'Deleted a premium key.', username: req.adminUser.username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Analytics ─────────────────────────────────────────
router.get('/analytics', requirePrivileged('MODERATOR'), async (req, res) => {
    try {
        const logs = await prisma.executionLog.findMany({
            orderBy: { createdAt: 'desc' }, take: 100,
            include: { hub: { include: { owner: { select: { username: true } } } } }
        });
        const result = logs.map(l => ({ ...l, hub_owner: l.hub?.owner?.username || 'Unknown' }));
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Security Events (from Panda honeypot) ────────────
router.get('/security-events', requirePrivileged('ADMIN'), async (req, res) => {
    try {
        const events = await prisma.securityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
        res.json(events);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;