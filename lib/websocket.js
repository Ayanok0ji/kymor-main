/**
 * Kymor WebSocket Authentication Server
 * Adapted from Panda-Websocket-Authentication
 * 
 * Features:
 * - Persistent WebSocket connections for Roblox clients
 * - Heartbeat/ping-pong with configurable timeout
 * - HMAC signature verification on all messages
 * - Rate limiting with violation tracking + temporary bans
 * - Connection database with stale cleanup
 * - Admin APIs: /connections, /stats, /disconnect
 */
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import prisma from './prisma.js';

// ─── Configuration ─────────────────────────────────────
const WS_CONFIG = {
    heartbeat: {
        interval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
        timeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT) || 35000,
    },
    rateLimit: {
        enabled: process.env.WS_RATE_LIMIT_ENABLED !== 'false',
        maxMessages: parseInt(process.env.WS_RATE_LIMIT_MAX) || 30,
        timeWindow: parseInt(process.env.WS_RATE_LIMIT_WINDOW) || 10000,
        banThreshold: parseInt(process.env.WS_RATE_LIMIT_BAN_THRESHOLD) || 3,
        banDuration: parseInt(process.env.WS_RATE_LIMIT_BAN_DURATION) || 60000,
    },
    security: {
        requireSignature: process.env.WS_REQUIRE_SIGNATURE === 'true',
    }
};

// ─── Connection Database (from Panda WebSocket) ────────
class ConnectionDatabase {
    constructor() {
        this.connections = new Map();
    }

    add(id, data) {
        this.connections.set(id, { ...data, lastActivity: Date.now(), active: true });
    }

    update(id, updates) {
        const conn = this.connections.get(id);
        if (conn) this.connections.set(id, { ...conn, ...updates, lastActivity: Date.now() });
    }

    remove(id) {
        const conn = this.connections.get(id);
        if (conn) {
            conn.active = false;
            conn.disconnectedAt = Date.now();
            this.connections.set(id, conn);
            setTimeout(() => this.connections.delete(id), 5 * 60 * 1000);
        }
    }

    getActive(hubId = null) {
        const result = [];
        this.connections.forEach((conn, id) => {
            if (conn.active && (!hubId || conn.hubId === hubId)) {
                result.push({ id, ...conn });
            }
        });
        return result;
    }

    getAll(hubId = null, includeInactive = false) {
        const result = [];
        this.connections.forEach((conn, id) => {
            if ((!hubId || conn.hubId === hubId) && (includeInactive || conn.active)) {
                result.push({ id, ...conn });
            }
        });
        return result;
    }

    cleanupStale(maxInactivity = 35000) {
        const now = Date.now();
        this.connections.forEach((conn, id) => {
            if (conn.active && now - conn.lastActivity > maxInactivity) {
                console.log(`[WS] Stale connection ${id} removed (${((now - conn.lastActivity) / 1000).toFixed(0)}s inactive)`);
                this.remove(id);
            }
        });
    }

    getStats(hubId = null) {
        const connections = this.getActive(hubId);
        return {
            total: connections.length,
            validated: connections.filter(c => c.validated).length,
            pending: connections.filter(c => !c.validated).length,
        };
    }
}

const connectionDB = new ConnectionDatabase();
const clients = new Map();
const connectionAttempts = new Map();

// ─── HMAC Signature Functions ──────────────────────────
function generateSignature(message, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(typeof message === 'string' ? message : JSON.stringify(message));
    return hmac.digest('hex');
}

function verifySignature(message, signature, secretKey) {
    try {
        const expected = generateSignature(message, secretKey);
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch (e) {
        return false;
    }
}

function generateUniqueId() {
    return crypto.randomBytes(8).toString('hex');
}

// ─── Rate Limiter ──────────────────────────────────────
function checkRateLimit(client, ws) {
    if (!WS_CONFIG.rateLimit.enabled) return true;

    const rl = client.rateLimit;
    const now = Date.now();

    // Check temporary ban
    if (rl.bannedUntil > now) {
        const remaining = Math.ceil((rl.bannedUntil - now) / 1000);
        ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: `Temporarily banned for ${remaining}s.` }));
        return false;
    }

    // Reset window
    if (now - rl.windowStart > WS_CONFIG.rateLimit.timeWindow) {
        rl.messageCount = 0;
        rl.windowStart = now;
    }

    rl.messageCount++;

    if (rl.messageCount > WS_CONFIG.rateLimit.maxMessages) {
        rl.violations++;
        if (rl.violations >= WS_CONFIG.rateLimit.banThreshold) {
            rl.bannedUntil = now + WS_CONFIG.rateLimit.banDuration;
            ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: `Banned for ${WS_CONFIG.rateLimit.banDuration / 1000}s due to rate violations.` }));
            console.log(`[WS] Client ${client.id} temporarily banned (rate limit)`);
            return false;
        }
        ws.send(JSON.stringify({ type: 'warning', code: 'RATE_LIMIT_WARNING', message: `Sending too fast. Violation ${rl.violations}/${WS_CONFIG.rateLimit.banThreshold}.` }));
        return false;
    }
    return true;
}

// ─── Key Validation ────────────────────────────────────
async function validateKey(hubShortId, hwid, keyString) {
    try {
        if (!hubShortId || !hwid || !keyString) return { success: false, message: 'Missing parameters' };

        const hub = await prisma.hub.findUnique({ where: { shortId: hubShortId } });
        if (!hub) return { success: false, message: 'Hub not found' };
        if (hub.paused) return { success: false, message: 'Hub is paused' };

        const key = await prisma.key.findUnique({ where: { keyString } });
        if (!key || key.hubId !== hub.id) return { success: false, message: 'Key not found' };
        if (key.status === 'BANNED') return { success: false, message: 'Key banned' };
        if (key.expiresAt && new Date() > key.expiresAt) return { success: false, message: 'Key expired' };

        // HWID check
        if (!key.nonHwid) {
            if (key.hwid && key.hwid !== hwid) return { success: false, message: 'HWID mismatch' };
            if (!key.hwid) await prisma.key.update({ where: { id: key.id }, data: { hwid } });
        }

        return { success: true, message: 'Validated', hubId: hub.id, hubShortId: hub.shortId, ownerId: hub.ownerId };
    } catch (e) {
        return { success: false, message: 'Validation error' };
    }
}

// ─── Setup WebSocket Server ────────────────────────────
export function setupWebSocket(server) {
    const wss = new WebSocketServer({
        server,
        handleProtocols: (protocols) => protocols.has('websocket') ? 'websocket' : false,
    });

    console.log(`🔌 WebSocket server ready | Heartbeat: ${WS_CONFIG.heartbeat.interval / 1000}s | Rate limit: ${WS_CONFIG.rateLimit.enabled ? 'ON' : 'OFF'}`);

    // ─── Connection Handler ────────────────────────────
    wss.on('connection', async (ws, req) => {
        const query = new URLSearchParams(req.url.split('?')[1] || '');
        const id = query.get('sessionId') || generateUniqueId();
        const hubId = query.get('hubId') || query.get('serviceId');
        const hwid = query.get('hwid');
        const clientKey = query.get('key');
        const username = query.get('username') || 'Unknown Player';
        const libraryType = query.get('libraryType') || detectLibrary(req.headers['user-agent']);

        // Duplicate connection prevention
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const connKey = `${clientIp}:${id}`;
        if (connectionAttempts.has(connKey) && Date.now() - connectionAttempts.get(connKey) < 5000) {
            return ws.close(1000, 'Duplicate connection');
        }
        connectionAttempts.set(connKey, Date.now());
        setTimeout(() => connectionAttempts.delete(connKey), 5 * 60 * 1000);

        const clientInfo = {
            id, hubId, hwid, clientKey, username, libraryType,
            isAlive: true, lastHeartbeat: Date.now(), connectedAt: Date.now(),
            ipAddress: clientIp, validated: false, status: 'Pending',
            rateLimit: { messageCount: 0, windowStart: Date.now(), violations: 0, bannedUntil: 0 }
        };

        clients.set(ws, clientInfo);
        connectionDB.add(id, clientInfo);
        console.log(`[WS] Client ${id} connected (${libraryType}) — Hub: ${hubId || 'none'}`);

        // Pong handler
        ws.on('pong', () => {
            const client = clients.get(ws);
            if (client) {
                client.isAlive = true;
                client.lastHeartbeat = Date.now();
                connectionDB.update(client.id, { lastHeartbeat: Date.now() });
            }
        });

        // ─── Message Handler ───────────────────────────
        ws.on('message', async (message) => {
            try {
                const client = clients.get(ws);
                if (!client) return;
                if (!checkRateLimit(client, ws)) return;

                const data = JSON.parse(message.toString());

                // Signature verification
                if (WS_CONFIG.security.requireSignature && data.type !== 'heartbeat') {
                    const { signature, ...payload } = data;
                    if (!signature || !client.hubId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Signature required' }));
                        return;
                    }
                    const hub = await prisma.hub.findUnique({ where: { shortId: client.hubId } });
                    if (!hub || !verifySignature(payload, signature, hub.apiKey)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' }));
                        return;
                    }
                }

                // Handle validate
                if (data.type === 'validate') {
                    const result = await validateKey(
                        data.hubId || client.hubId,
                        data.hwid || client.hwid,
                        data.key || client.clientKey
                    );

                    if (result.success) {
                        client.validated = true;
                        client.status = 'Active';
                        client.username = data.username || client.username;
                        client.hubId = result.hubShortId;
                        connectionDB.update(client.id, { validated: true, status: 'Active', username: client.username, hubId: result.hubShortId });

                        // Create player session in DB
                        await prisma.playerSession.upsert({
                            where: { id: client.id },
                            update: { lastPing: new Date(), playerName: client.username, ipAddress: clientIp },
                            create: {
                                hubId: result.hubId, hwid: client.hwid || 'ws-client',
                                playerName: client.username, executor: client.libraryType,
                                gameName: data.gameName || 'Unknown', ipAddress: clientIp
                            }
                        }).catch(() => {});

                        ws.send(JSON.stringify({ type: 'validation_response', success: true, message: 'Key validated!' }));
                        console.log(`[WS] Client ${client.id} validated as ${client.username}`);
                    } else {
                        ws.send(JSON.stringify({ type: 'validation_response', success: false, message: result.message }));
                    }
                }
                // Handle heartbeat
                else if (data.type === 'heartbeat') {
                    client.isAlive = true;
                    client.lastHeartbeat = Date.now();
                    connectionDB.update(client.id, { lastHeartbeat: Date.now() });
                    ws.send(JSON.stringify({ type: 'heartbeat_response', timestamp: Date.now() }));
                }
                // Handle script request
                else if (data.type === 'fetch_script' && client.validated) {
                    const script = await prisma.script.findFirst({ where: { scriptId: data.scriptId, hub: { shortId: client.hubId } } });
                    if (script && script.isActive) {
                        const { decryptCode } = await import('./crypto.js');
                        const code = decryptCode(script.code, script.codeIv, script.codeTag);
                        ws.send(JSON.stringify({ type: 'script_response', success: true, code }));
                        await prisma.script.update({ where: { id: script.id }, data: { executions: { increment: 1 } } }).catch(() => {});
                    } else {
                        ws.send(JSON.stringify({ type: 'script_response', success: false, message: 'Script not found or disabled' }));
                    }
                }
                // Handle status update
                else if (data.type === 'status_update' && client.validated) {
                    connectionDB.update(client.id, {
                        gameName: data.gameName, ping: data.ping,
                        playerName: data.playerName || client.username
                    });
                }
            } catch (error) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
            }
        });

        // ─── Disconnect Handler ────────────────────────
        ws.on('close', () => {
            console.log(`[WS] Client ${id} disconnected | Active: ${clients.size - 1}`);
            clients.delete(ws);
            connectionDB.remove(id);
        });

        // Send welcome message
        const welcomeMsg = {
            type: 'welcome', message: 'Connected to Kymor WebSocket',
            clientId: id, requiresSignature: WS_CONFIG.security.requireSignature,
            serverTimestamp: Date.now()
        };
        ws.send(JSON.stringify(welcomeMsg));
    });

    // ─── Heartbeat Mechanism ───────────────────────────
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            const client = clients.get(ws);
            if (!client) return;

            if (client.isAlive === false || Date.now() - client.lastHeartbeat > WS_CONFIG.heartbeat.timeout) {
                console.log(`[WS] Client ${client.id} timed out`);
                clients.delete(ws);
                connectionDB.remove(client.id);
                return ws.terminate();
            }

            client.isAlive = false;
            ws.ping();
        });
    }, WS_CONFIG.heartbeat.interval);

    // Stale connection cleanup
    setInterval(() => connectionDB.cleanupStale(WS_CONFIG.heartbeat.timeout), WS_CONFIG.heartbeat.interval);

    wss.on('close', () => clearInterval(heartbeatInterval));

    return { wss, connectionDB, clients };
}

// ─── WebSocket Admin API Routes ────────────────────────
export function setupWebSocketAPI(app, wsContext) {
    const { connectionDB, clients } = wsContext;

    // Get active connections
    app.get('/api/ws/connections', (req, res) => {
        const hubId = req.query.hubId || req.headers['x-hub-id'];
        const includeInactive = req.query.includeInactive === 'true';
        const connections = includeInactive ? connectionDB.getAll(hubId, true) : connectionDB.getActive(hubId);
        res.json({ total: connections.length, connections });
    });

    // Disconnect a client
    app.post('/api/ws/connections/:id/disconnect', (req, res) => {
        const { id } = req.params;
        let found = false;
        clients.forEach((client, ws) => {
            if (client.id === id) {
                try { ws.send(JSON.stringify({ type: 'admin_disconnect', message: 'Disconnected by administrator' })); } catch (e) {}
                try { ws.terminate(); } catch (e) {}
                clients.delete(ws);
                connectionDB.remove(id);
                found = true;
            }
        });
        res.json({ success: found, message: found ? `Client ${id} disconnected` : 'Client not found' });
    });

    // Get connection stats
    app.get('/api/ws/stats', (req, res) => {
        const hubId = req.query.hubId;
        res.json(connectionDB.getStats(hubId));
    });

    // Force refresh connections
    app.post('/api/ws/connections/refresh', (req, res) => {
        connectionDB.cleanupStale();
        res.json({ success: true, activeConnections: connectionDB.getActive().length });
    });

    // Health check
    app.get('/api/ws/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), activeClients: clients.size });
    });
}

// ─── Helpers ───────────────────────────────────────────
function detectLibrary(userAgent = '') {
    if (userAgent.includes('Roblox')) return 'Roblox Lua';
    if (userAgent.includes('Node')) return 'Node.js';
    if (userAgent.includes('Python')) return 'Python';
    if (userAgent.includes('Unity')) return 'Unity C#';
    return 'Lua Client';
}

export { connectionDB, WS_CONFIG };
