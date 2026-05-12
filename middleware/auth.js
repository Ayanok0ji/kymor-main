/**
 * Kymor Auth Middleware — JWT + Role-based Access Control
 */
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

/**
 * Require authenticated user — attaches req.user
 */
export const requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies.kymor_token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ error: 'User not found' });
        if (!user.isVerified) return res.status(403).json({ error: 'Email not verified' });

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired' });
        return res.status(401).json({ error: 'Invalid session' });
    }
};

/**
 * Require specific role — must be used AFTER requireAuth
 */
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient privileges' });
    next();
};

/**
 * Require admin or moderator with 2FA enabled
 */
export const requirePrivileged = async (req, res, next) => {
    try {
        const token = req.cookies.kymor_token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ error: 'User not found' });

        const roleHierarchy = { USER: 0, MODERATOR: 1, ADMIN: 2 };
        if ((roleHierarchy[user.role] || 0) < 1) return res.status(403).json({ error: 'Staff access required' });
        if (!user.isTwoFactorEnabled) return res.status(403).json({ error: 'Security Policy: Staff must enable 2FA.' });

        req.user = user;
        req.adminUser = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid session' });
    }
};

/**
 * Require hub ownership — loads hub and verifies owner
 * Attaches req.hub
 */
export const requireHubOwner = async (req, res, next) => {
    try {
        const shortId = req.params.shortId || req.params.hubId;
        if (!shortId) return res.status(400).json({ error: 'Hub ID required' });

        const hub = await prisma.hub.findFirst({
            where: { shortId, ownerId: req.user.id }
        });

        if (!hub) return res.status(404).json({ error: 'Hub not found or not yours' });

        req.hub = hub;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Hub lookup failed' });
    }
};

/**
 * API Key authentication (for external integrations)
 */
export const requireApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        if (!apiKey) return res.status(401).json({ error: 'API key required' });

        const hub = await prisma.hub.findUnique({ where: { apiKey } });
        if (!hub) return res.status(401).json({ error: 'Invalid API key' });

        req.hub = hub;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Auth failed' });
    }
};

/**
 * Redirect to login if not authenticated (for page routes)
 */
export const redirectIfNotAuth = (req, res, next) => {
    const token = req.cookies.kymor_token;
    if (!token) return res.redirect('/login');
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.clearCookie('kymor_token');
        return res.redirect('/login');
    }
};

/**
 * Redirect to dashboard if already logged in
 */
export const redirectIfAuth = (req, res, next) => {
    const token = req.cookies.kymor_token;
    if (!token) return next();
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return res.redirect('/dashboard');
    } catch (err) {
        res.clearCookie('kymor_token');
        return next();
    }
};
