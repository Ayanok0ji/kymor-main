/**
 * Kymor Honeypot Middleware
 * Adapted from Panda Key System's honeypot detection
 * 
 * Analyzes requests for bypass attempts, suspicious fingerprints,
 * and automated tooling. Logs security events to the database.
 */
import prisma from '../lib/prisma.js';

/**
 * Weighted bypass probability calculation
 * High-weight flags are stronger indicators of bypass attempts
 */
function calculateBypassProbability(flags) {
    const highWeight = ['automatedTool', 'hwidBypass', 'headerSpoofing', 'cfInconsistency', 'browserInconsistency'];
    const mediumWeight = ['suspiciousParams', 'invalidOrigin', 'suspiciousHeaders', 'malformedBody', 'serviceBypass', 'mobileEmulation'];

    let weightedScore = 0;
    let totalWeight = 0;

    for (const [flag, value] of Object.entries(flags)) {
        if (value === true) {
            if (highWeight.includes(flag)) { weightedScore += 3; totalWeight += 3; }
            else if (mediumWeight.includes(flag)) { weightedScore += 2; totalWeight += 2; }
            else { weightedScore += 1; totalWeight += 1; }
        }
    }

    return totalWeight === 0 ? 0 : (weightedScore / totalWeight) * 100;
}

function determineSeverity(probability) {
    if (probability > 75) return 'CRITICAL';
    if (probability > 50) return 'HIGH';
    if (probability > 25) return 'MEDIUM';
    return 'LOW';
}

function categorizeDetection(probability) {
    if (probability > 75) return 'confirmed_bypass_attempt';
    if (probability > 50) return 'high_confidence_bypass';
    if (probability > 25) return 'medium_confidence_bypass';
    return 'suspicious_activity';
}

const HIGH_RISK_COUNTRIES = ['RU', 'CN', 'VN', 'UA', 'KP', 'IR', 'SY'];

/**
 * Main honeypot middleware — non-blocking, always calls next()
 */
export default async function honeypotMiddleware(req, res, next) {
    try {
        const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
        const hwid = req.body?.hwid || req.query?.hwid;
        const userAgent = req.headers['user-agent'] || '';
        const referer = req.headers['referer'] || '';
        const cfIpCountry = req.headers['cf-ipcountry'] || '';

        const bypassFlags = {
            noUserAgent: !req.headers['user-agent'],
            automatedTool: /python|curl|wget|puppeteer|selenium|playwright|postman|insomnia|axios|got|bot|crawl|script/i.test(userAgent),
            missingHeaders: !req.headers['accept-language'] || !req.headers['accept-encoding'],
            noReferrer: !referer,
            invalidOrigin: req.headers['origin'] && !req.headers['origin'].includes(process.env.PUBLIC_URL || 'kymor'),
            suspiciousHeaders: Object.keys(req.headers).some(h => h.toLowerCase().includes('bypass') || h.toLowerCase().includes('proxy')),
            malformedBody: req.body && (typeof req.body !== 'object' || Object.keys(req.body).length > 20 || JSON.stringify(req.body).length > 5000),
            hwidBypass: hwid && !/^[a-zA-Z0-9_\-]{10,512}$/.test(hwid),
            mobileEmulation: userAgent.includes('Mobile') && req.headers['sec-ch-ua-mobile'] === '?0',
            countryMismatch: cfIpCountry && HIGH_RISK_COUNTRIES.includes(cfIpCountry),
            cfInconsistency: req.headers['cf-connecting-ip'] && (!req.headers['cf-ray'] || !req.headers['cf-visitor']),
        };

        const suspiciousCount = Object.values(bypassFlags).filter(Boolean).length;

        if (suspiciousCount > 0) {
            const probability = calculateBypassProbability(bypassFlags);
            const severity = determineSeverity(probability);

            // Non-blocking: fire-and-forget DB write
            prisma.securityEvent.create({
                data: {
                    ipAddress: clientIp || 'unknown',
                    hwid: hwid || null,
                    eventType: 'BYPASS_ATTEMPT',
                    severity,
                    bypassScore: probability,
                    detectionType: categorizeDetection(probability),
                    flags: bypassFlags,
                    browserFingerprint: {
                        userAgent,
                        language: req.headers['accept-language'] || '',
                        platform: req.headers['sec-ch-ua-platform'] || '',
                        country: cfIpCountry,
                    },
                    userAgent: userAgent.substring(0, 500),
                    requestPath: (req.originalUrl || req.url).substring(0, 500),
                }
            }).catch(() => {}); // Silently fail — never block requests

            // Slow down high-probability bypass attempts
            if (probability > 50) {
                await new Promise(resolve => setTimeout(resolve, Math.min(suspiciousCount * 200, 2000)));
            }
        }
    } catch (e) {
        // Never block request flow
    }

    next();
}
