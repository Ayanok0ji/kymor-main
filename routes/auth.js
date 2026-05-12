/**
 * Kymor Auth Routes — Registration, Login, 2FA, Password Reset
 * MySQL/Prisma | Rate Limited | OTP via Email
 */
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { sendMail, generateEmailHtml } from '../utils/mailer.js';

const router = express.Router();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const SENDER_EMAIL = process.env.EMAIL_USER || 'noreply@kymor.dev';

// ─── Rate Limiters ─────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many requests. Please try again later.' }
});

const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Rate limit exceeded. Try again in 1 hour.' }
});

// ─── Register ──────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, acceptedTOS } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields required.' });
        if (!acceptedTOS) return res.status(400).json({ error: 'You must accept the Terms of Service.' });
        if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters.' });
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });

        // Check existing
        const existing = await prisma.user.findFirst({
            where: { OR: [
                { username: { equals: username, mode: 'insensitive' } },
                { email: { equals: email, mode: 'insensitive' } }
            ]}
        });
        if (existing) return res.status(400).json({ error: 'Username or email already exists.' });

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const otp = generateOTP();
        const otpHash = await bcrypt.hash(otp, salt);

        const user = await prisma.user.create({
            data: {
                username,
                email: email.toLowerCase(),
                password: hashedPassword,
                acceptedTOS: true,
                verificationOtp: otpHash,
                verificationOtpExpire: new Date(Date.now() + 10 * 60 * 1000)
            }
        });

        const emailHtml = generateEmailHtml({
            type: 'otp',
            title: 'Verify Your Account',
            subtitle: 'Enter this code to activate your Kymor account.',
            otpCode: otp,
            footerText: "If you didn't create a Kymor account, ignore this email."
        });

        sendMail({
            from: `"Kymor" <${SENDER_EMAIL}>`,
            to: email,
            subject: "Kymor — Verify Your Account",
            html: emailHtml
        }).catch(() => {});

        res.json({ success: true, userId: user.id, message: 'Account created. Verification code sent to your email.' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// ─── Verify Email OTP ──────────────────────────────────
router.post('/verify-email', authLimiter, async (req, res) => {
    try {
        const { userId, otp } = req.body;
        if (!userId || !otp) return res.status(400).json({ error: 'Missing data.' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.isVerified) return res.json({ success: true, message: 'Already verified.' });
        if (!user.verificationOtpExpire || new Date() > user.verificationOtpExpire) {
            return res.status(400).json({ error: 'Code expired. Please request a new one.' });
        }
        if (!(await bcrypt.compare(otp, user.verificationOtp))) {
            return res.status(400).json({ error: 'Incorrect code.' });
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                isVerified: true,
                verificationOtp: null,
                verificationOtpExpire: null
            }
        });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('kymor_token', token, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000
        });

        const welcomeHtml = generateEmailHtml({
            type: 'welcome',
            title: 'Welcome to Kymor',
            subtitle: 'Your account has been verified. Here are your details.',
            userDetails: { username: user.username, email: user.email, tier: 'Free', status: 'Active' },
            discordLink: 'https://discord.gg/kymor',
            footerText: "You're all set. Start building your first hub from the dashboard."
        });

        sendMail({
            from: `"Kymor" <${SENDER_EMAIL}>`,
            to: user.email,
            subject: "Welcome to Kymor!",
            html: welcomeHtml
        }).catch(() => {});

        res.json({ success: true, message: 'Verified!' });
    } catch (err) {
        res.status(500).json({ error: 'Verification failed.' });
    }
});

// ─── Login ─────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return res.status(400).json({ error: 'Please enter your credentials.' });

        const user = await prisma.user.findFirst({
            where: { OR: [
                { username: { equals: identifier.trim(), mode: 'insensitive' } },
                { email: { equals: identifier.trim(), mode: 'insensitive' } }
            ]}
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ error: 'Please verify your email first.', userId: user.id, needsVerification: true });
        }

        if (user.isTwoFactorEnabled) {
            const otp = generateOTP();
            const salt = await bcrypt.genSalt(10);
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    twoFactorOtp: await bcrypt.hash(otp, salt),
                    twoFactorOtpExpire: new Date(Date.now() + 10 * 60 * 1000)
                }
            });

            const emailHtml = generateEmailHtml({
                type: 'otp',
                title: 'Two-Factor Authentication',
                subtitle: 'A sign-in attempt requires your verification code.',
                otpCode: otp,
                footerText: "If this wasn't you, change your password immediately."
            });

            sendMail({
                from: `"Security" <${SENDER_EMAIL}>`,
                to: user.email,
                subject: "Kymor 2FA Code",
                html: emailHtml
            }).catch(() => {});

            return res.json({ requires_otp: true, userId: user.id, message: 'Verification code sent.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('kymor_token', token, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ─── 2FA Verify ────────────────────────────────────────
router.post('/verify-2fa', authLimiter, async (req, res) => {
    try {
        const { userId, otp } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorOtpExpire || new Date() > user.twoFactorOtpExpire) {
            return res.status(400).json({ error: 'Code expired.' });
        }
        if (!(await bcrypt.compare(otp, user.twoFactorOtp))) {
            return res.status(400).json({ error: 'Incorrect code.' });
        }

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorOtp: null, twoFactorOtpExpire: null }
        });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('kymor_token', token, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Verification failed.' });
    }
});

// ─── Toggle 2FA ────────────────────────────────────────
router.post('/toggle-2fa', async (req, res) => {
    try {
        const token = req.cookies.kymor_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        await prisma.user.update({
            where: { id: user.id },
            data: { isTwoFactorEnabled: !user.isTwoFactorEnabled }
        });

        res.json({ success: true, enabled: !user.isTwoFactorEnabled });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ─── Resend Verification ───────────────────────────────
router.post('/resend-verification', strictLimiter, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.isVerified) return res.status(400).json({ error: 'Invalid request.' });

        const otp = generateOTP();
        const salt = await bcrypt.genSalt(10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verificationOtp: await bcrypt.hash(otp, salt),
                verificationOtpExpire: new Date(Date.now() + 10 * 60 * 1000)
            }
        });

        const emailHtml = generateEmailHtml({
            type: 'otp',
            title: 'Verify Your Account',
            subtitle: 'Here is a new verification code.',
            otpCode: otp,
            footerText: "This code expires in 10 minutes."
        });

        sendMail({
            from: `"Kymor" <${SENDER_EMAIL}>`,
            to: user.email,
            subject: "Kymor — New Verification Code",
            html: emailHtml
        }).catch(() => {});

        res.json({ success: true, message: 'New code sent.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to resend.' });
    }
});

// ─── Forgot Password ──────────────────────────────────
router.post('/forgot-password', strictLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required.' });

        const user = await prisma.user.findFirst({
            where: { email: { equals: email.trim(), mode: 'insensitive' } }
        });

        // Always return success (prevents email enumeration)
        if (!user) return res.json({ success: true, message: 'If the account exists, a code was sent.' });

        const otp = generateOTP();
        const salt = await bcrypt.genSalt(10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetOtp: await bcrypt.hash(otp, salt),
                resetOtpExpire: new Date(Date.now() + 10 * 60 * 1000)
            }
        });

        const emailHtml = generateEmailHtml({
            type: 'otp',
            title: 'Password Reset',
            subtitle: 'Use this code to reset your password.',
            otpCode: otp,
            footerText: "If you didn't request this, ignore this email."
        });

        sendMail({
            from: `"Security" <${SENDER_EMAIL}>`,
            to: user.email,
            subject: "Kymor — Password Reset",
            html: emailHtml
        }).catch(() => {});

        res.json({ success: true, userId: user.id, message: 'If the account exists, a code was sent.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ─── Reset Password ───────────────────────────────────
router.post('/reset-password', strictLimiter, async (req, res) => {
    try {
        const { userId, otp, newPassword } = req.body;
        if (!userId || !otp || !newPassword) return res.status(400).json({ error: 'All fields required.' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.resetOtpExpire || new Date() > user.resetOtpExpire) {
            return res.status(400).json({ error: 'Code expired.' });
        }
        if (!(await bcrypt.compare(otp, user.resetOtp))) {
            return res.status(400).json({ error: 'Incorrect code.' });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetOtp: null,
                resetOtpExpire: null
            }
        });

        // Invalidate existing sessions by kicking user
        if (global.kickUser) global.kickUser(user.id, 'Password changed. Please log in again.');

        res.json({ success: true, message: 'Password reset. Please log in.' });
    } catch (err) {
        res.status(500).json({ error: 'Reset failed.' });
    }
});

// ─── Logout ────────────────────────────────────────────
router.post('/logout', (req, res) => {
    res.clearCookie('kymor_token');
    res.json({ success: true });
});

// ─── Get Current User ──────────────────────────────────
router.get('/me', async (req, res) => {
    try {
        const token = req.cookies.kymor_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true, username: true, email: true, role: true,
                isPremium: true, isVerified: true, apiKey: true,
                isTwoFactorEnabled: true, createdAt: true,
                obfuscationsToday: true, lastObfuscationDate: true
            }
        });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    } catch (err) {
        res.status(401).json({ error: 'Invalid session.' });
    }
});

export default router;