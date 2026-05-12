/**
 * Kymor Rate Limiter Middleware — Configurable per-route rate limiting
 */
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * Strict auth rate limiter (login/register)
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many authentication attempts.' },
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * Very strict limiter for sensitive operations (password reset, OTP)
 */
export const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Rate limit exceeded. Try again in 1 hour.' },
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * Admin panel limiter
 */
export const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many attempts. Terminal locked.' },
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * SDK/Roblox API rate limiter
 */
export const sdkLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: { code: 'RATE_LIMITED', message: 'Too many requests from this IP.' },
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * Reward system rate limiter
 */
export const rewardLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Slow down. Try again in a minute.' },
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
});

/**
 * Per-IP sliding window tracker for custom limits
 * Used for dynamic per-hub limits
 */
const ipWindowTracker = new Map();

export function customRateCheck(ip, windowMs, maxHits, label = 'default') {
    const key = `${label}:${ip}`;
    const now = Date.now();

    if (!ipWindowTracker.has(key)) {
        ipWindowTracker.set(key, [now]);
        return true;
    }

    const hits = ipWindowTracker.get(key).filter(t => now - t < windowMs);
    hits.push(now);
    ipWindowTracker.set(key, hits);

    return hits.length <= maxHits;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    ipWindowTracker.forEach((hits, key) => {
        const recent = hits.filter(t => now - t < maxAge);
        if (recent.length === 0) ipWindowTracker.delete(key);
        else ipWindowTracker.set(key, recent);
    });
}, 5 * 60 * 1000);
