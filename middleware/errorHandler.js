/**
 * Kymor Error Handler Middleware — Centralized Error Processing
 */
import logger from '../lib/logger.js';

/**
 * Async handler wrapper — catches promise rejections
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res, next) => {
    const error = new Error(`Not Found: ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

/**
 * Global error handler
 */
export const errorHandler = (err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : err.message;

    // Log based on severity
    if (statusCode >= 500) {
        logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
            stack: err.stack,
            ip: req.headers['cf-connecting-ip'] || req.ip,
            userAgent: req.headers['user-agent']
        });
    } else if (statusCode >= 400) {
        logger.warn(`${req.method} ${req.originalUrl} — ${err.message}`, {
            ip: req.headers['cf-connecting-ip'] || req.ip,
            statusCode
        });
    }

    // Prisma-specific errors
    if (err.code === 'P2002') {
        return res.status(409).json({ error: 'A record with this value already exists.' });
    }
    if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found.' });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token.' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired.' });
    }

    // Joi validation errors
    if (err.isJoi) {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.details?.map(d => d.message)
        });
    }

    // API vs HTML response
    if (req.accepts('json') || req.path.startsWith('/api')) {
        res.status(statusCode).json({
            error: message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    } else {
        res.status(statusCode).send(`<h1>${statusCode} — ${message}</h1>`);
    }
};
