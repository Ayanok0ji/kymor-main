/**
 * Kymor Logger — Winston-based Structured Logging (from Panda pattern)
 */
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logDir = path.join(__dirname, '..', 'logs');

const customFormat = winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length > 0) log += ` ${JSON.stringify(meta)}`;
    return log;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        customFormat
    ),
    defaultMeta: { service: 'kymor' },
    transports: [
        // Console output (colorized)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                customFormat
            )
        }),
        // File: all logs
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File: errors only
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        // File: security events
        new winston.transports.File({
            filename: path.join(logDir, 'security.log'),
            level: 'warn',
            maxsize: 5242880,
            maxFiles: 10
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
    ],
    rejectionHandlers: [
        new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
    ]
});

// Convenience methods for security logging
logger.security = (message, meta = {}) => {
    logger.warn(`🛡️ ${message}`, { ...meta, category: 'security' });
};

logger.auth = (message, meta = {}) => {
    logger.info(`🔐 ${message}`, { ...meta, category: 'auth' });
};

logger.db = (message, meta = {}) => {
    logger.info(`🗄️ ${message}`, { ...meta, category: 'database' });
};

logger.ws = (message, meta = {}) => {
    logger.info(`🔌 ${message}`, { ...meta, category: 'websocket' });
};

logger.bot = (message, meta = {}) => {
    logger.info(`🤖 ${message}`, { ...meta, category: 'discord' });
};

export default logger;
