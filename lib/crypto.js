/**
 * Kymor Crypto Utilities
 * 
 * AES-256-GCM encryption for script code at rest
 * HMAC-SHA256 signing for SDK ↔ Server communication
 * Inspired by Panda WebSocket's signature verification system
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from environment (must be 32 bytes / 64 hex chars)
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
        // Auto-generate a key if not set (warn in production)
        if (process.env.NODE_ENV === 'production') {
            console.error('⚠️  ENCRYPTION_KEY not set or too short! Scripts will NOT be encrypted.');
        }
        return null;
    }
    // If hex string (64 chars = 32 bytes), convert to buffer
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
        return Buffer.from(key, 'hex');
    }
    // Otherwise use first 32 bytes
    return Buffer.from(key.substring(0, 32), 'utf-8');
}

/**
 * Encrypt script code with AES-256-GCM
 * @param {string} plaintext - The script code to encrypt
 * @returns {{ encrypted: string, iv: string, tag: string }} Encrypted data
 */
export function encryptCode(plaintext) {
    const key = getEncryptionKey();
    if (!key) {
        // Fallback: store as-is but base64 encode to at least obscure
        return {
            encrypted: Buffer.from(plaintext, 'utf-8').toString('base64'),
            iv: null,
            tag: null
        };
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    };
}

/**
 * Decrypt script code from AES-256-GCM
 * @param {string} encryptedData - Base64 encrypted data
 * @param {string|null} iv - Hex IV
 * @param {string|null} tag - Hex auth tag
 * @returns {string} Decrypted plaintext
 */
export function decryptCode(encryptedData, iv, tag) {
    const key = getEncryptionKey();
    if (!key || !iv || !tag) {
        // Fallback: base64 decode
        return Buffer.from(encryptedData, 'base64').toString('utf-8');
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encryptedData, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
}

/**
 * Generate HMAC-SHA256 signature for request payload
 * Used for SDK ↔ Server authentication (from Panda WebSocket pattern)
 * 
 * @param {string} payload - The payload string to sign
 * @param {string} secret - The secret key (hub API key)
 * @returns {string} Hex HMAC signature
 */
export function generateHmacSignature(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison
 * Prevents timing attacks (from Panda WebSocket's crypto.timingSafeEqual)
 * 
 * @param {string} payload - The payload that was signed
 * @param {string} signature - The signature to verify
 * @param {string} secret - The secret key
 * @returns {boolean} Whether the signature is valid
 */
export function verifyHmacSignature(payload, signature, secret) {
    try {
        const expected = generateHmacSignature(payload, secret);
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (e) {
        return false;
    }
}

/**
 * Generate a cryptographically secure random token
 * @param {number} bytes - Number of random bytes
 * @returns {string} Hex token string
 */
export function generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a short ID for hubs, scripts, etc.
 * @param {number} bytes - Number of random bytes (default 4 = 8 hex chars)
 * @returns {string} Hex short ID
 */
export function generateShortId(bytes = 4) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a key string with optional prefix
 * @param {boolean} isPremium - Whether the user is premium (no prefix)
 * @param {number} bytes - Random bytes for key (default 8 = 16 hex chars)
 * @returns {string} Key string like "KYMOR-A1B2C3D4E5F6G7H8"
 */
export function generateKeyString(isPremium = false, bytes = 8) {
    const raw = crypto.randomBytes(bytes).toString('hex').toUpperCase();
    return isPremium ? raw : `KYMOR-${raw}`;
}

/**
 * Hash a value with SHA-256 (for non-reversible storage)
 * @param {string} value - Value to hash
 * @returns {string} Hex hash
 */
export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
