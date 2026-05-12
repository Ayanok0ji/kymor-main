/**
 * Kymor SaaS Key System — Server Entry Point
 * MySQL + Prisma | Security Hardened | VPS + Vercel Ready
 */
import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
import xss from 'xss-clean';
import { fileURLToPath } from 'url';
import fs from 'fs';

import prisma from './lib/prisma.js';
import logger from './lib/logger.js';
import { setupWebSocket, setupWebSocketAPI } from './lib/websocket.js';
import honeypotMiddleware from './middleware/honeypot.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

import robloxRoutes from './routes/roblox.js';
import rewardsRoutes from './routes/rewards.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import pageRoutes from './routes/page.js';
import bot from './bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

global.activeSockets = new Map();

// ─── 404 Page ──────────────────────────────────────────
const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>404 - Signal Lost | Kymor</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        body { background-color: #050505; color: #ffffff; font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; overflow: hidden; padding: 20px; }
        .liquid-blob { position: fixed; border-radius: 50%; filter: blur(100px); opacity: 0.2; z-index: -1; animation: float 20s infinite alternate ease-in-out; pointer-events: none; }
        .blob-1 { width: 60vw; height: 60vw; background: #14b8a6; top: -10%; left: -10%; }
        .blob-2 { width: 50vw; height: 50vw; background: #3b82f6; bottom: -10%; right: -10%; animation-delay: -10s; }
        @keyframes float { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(5%, 10%) scale(1.1); } 100% { transform: translate(-2%, -8%) scale(0.9); } }
        .glass-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); background: rgba(5, 5, 5, 0.4); z-index: -1; pointer-events: none; }
        .btn-pill-outline { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; color: #fff; text-decoration: none; font-weight: 700; transition: all 0.3s; background: rgba(255,255,255,0.05); }
        .btn-pill-outline:hover { background: rgba(255,255,255,0.1); transform: translateY(-2px); }
        .hero-title { font-size: clamp(4rem, 15vw, 10rem); text-shadow: 0 0 60px rgba(20,184,166,0.3); color: #fff; margin: 0; line-height: 1; font-weight: 900; }
        .fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; transform: translateY(30px); }
        @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="liquid-blob blob-1"></div>
    <div class="liquid-blob blob-2"></div>
    <div class="glass-overlay"></div>
    <div style="text-align:center; padding: 20px; z-index: 10; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; width: 100vw;">
        <h1 class="hero-title fade-in-up">404</h1>
        <h2 class="fade-in-up" style="margin-top: -10px; font-size: clamp(1.5rem, 5vw, 2.5rem); font-weight: 800; animation-delay: 0.1s;">Signal Lost</h2>
        <p class="fade-in-up" style="color: #a1a1aa; max-width: 400px; margin: 20px auto; font-size: 1rem; animation-delay: 0.2s; padding: 0 20px;">The page you are looking for is offline or does not exist.</p>
        <div class="fade-in-up" style="animation-delay: 0.3s; width:100%; display:flex; justify-content:center; margin-top: 30px;">
            <a href="/" class="btn-pill-outline"><i data-lucide="home"></i> <span style="margin-left:8px;">Return Home</span></a>
        </div>
    </div>
    <script>lucide.createIcons();</script>
</body>
</html>`;

// ─── Socket.IO Auth ────────────────────────────────────
io.use((socket, next) => {
    try {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const token = cookies.kymor_token;
        if (!token) return next(new Error('Authentication error'));
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.userId = decoded.id;
            next();
        });
    } catch (e) {
        next(new Error('Authentication error'));
    }
});

io.on('connection', (socket) => {
    global.activeSockets.set(socket.userId.toString(), socket.id);
    socket.on('disconnect', () => {
        global.activeSockets.delete(socket.userId.toString());
    });
});

global.kickUser = function(userId, reason) {
    const socketId = global.activeSockets.get(userId.toString());
    if (socketId) {
        io.to(socketId).emit('force_logout', { message: reason });
    }
};

// ─── Express Config ────────────────────────────────────
app.set('io', io);
app.set('trust proxy', true);
app.set('case sensitive routing', true);

app.use(express.json({ 
    limit: '2mb',
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
app.use(cookieParser());
app.use(xss());

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://www.paypal.com", "https://esm.sh", "https://cdn.tailwindcss.com"],
            connectSrc: ["'self'", "wss:", "ws:", "https://api-m.paypal.com", "https://www.paypal.com", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://esm.sh"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'self'", "https://www.sandbox.paypal.com", "https://www.paypal.com"],
            scriptSrcAttr: ["'unsafe-inline'"], 
            upgradeInsecureRequests: [],
        }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(helmet.frameguard({ action: 'deny' }));
app.disable('x-powered-by');

// ─── Static Files ──────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'dist/uploads')));
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));
app.use(express.static(path.join(__dirname, 'client'), { index: false }));

// ─── Maintenance Mode (Prisma) ─────────────────────────
let cachedConfig = { maintenanceMode: false, authorizedIps: [] };
let lastCacheUpdate = 0;

function getClientIp(req) {
    let ip = req.headers['cf-connecting-ip'] || req.ip;
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    return ip || 'Unknown';
}

app.use(async (req, res, next) => {
    try {
        const now = Date.now();
        if (now - lastCacheUpdate > 2000) {
            const config = await prisma.platformConfig.findFirst();
            if (config) {
                cachedConfig = {
                    maintenanceMode: config.maintenanceMode,
                    authorizedIps: config.authorizedIps || []
                };
            }
            lastCacheUpdate = now;
        }

        if (cachedConfig.maintenanceMode === true) {
            const clientIp = getClientIp(req);
            const authorizedIps = Array.isArray(cachedConfig.authorizedIps) ? cachedConfig.authorizedIps : [];
            if (authorizedIps.includes(clientIp)) return next();

            const isStaticBypass = 
                req.path === '/style.css' || req.path === '/favicon.ico' || 
                req.path.startsWith('/js/') || req.path.startsWith('/socket.io') || req.path.startsWith('/assets/');

            if (isStaticBypass) return next();

            return res.status(503).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Maintenance | Kymor</title><link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="stylesheet" href="/style.css"><script src="https://unpkg.com/lucide@latest"></script>
<style>body{background-color:#050505;color:#fff;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;overflow:hidden;padding:20px}.liquid-blob{position:fixed;border-radius:50%;filter:blur(100px);opacity:.2;z-index:-1;animation:float 20s infinite alternate ease-in-out;pointer-events:none}.blob-1{width:60vw;height:60vw;background:#f59e0b;top:-10%;left:-10%}.blob-2{width:50vw;height:50vw;background:#ea580c;bottom:-10%;right:-10%;animation-delay:-10s}@keyframes float{0%{transform:translate(0,0) scale(1)}50%{transform:translate(5%,10%) scale(1.1)}100%{transform:translate(-2%,-8%) scale(.9)}}.card{background:rgba(10,10,11,.8);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.08);padding:3rem 2rem;border-radius:2.5rem;text-align:center;width:100%;max-width:440px;box-shadow:0 25px 50px -12px rgba(0,0,0,.7)}.icon-box{width:84px;height:84px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.25);border-radius:1.5rem;display:flex;align-items:center;justify-content:center;margin:0 auto 2rem;color:#f59e0b}h1{font-size:2rem;font-weight:800;margin-bottom:1rem}p{color:#9ca3af;font-size:1rem;line-height:1.6;margin-bottom:2rem}.status-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:100px;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:#6b7280}.dot{width:6px;height:6px;background:#f59e0b;border-radius:50%;box-shadow:0 0 10px #f59e0b;animation:pulse 2s infinite}@keyframes pulse{0%{opacity:1}50%{opacity:.4}100%{opacity:1}}</style></head>
<body><div class="liquid-blob blob-1"></div><div class="liquid-blob blob-2"></div>
<div class="card"><div class="icon-box"><i data-lucide="cog" style="width:40px;height:40px;"></i></div>
<h1>Under Maintenance</h1><p>Kymor is refining its infrastructure. We'll be back shortly.</p>
<div class="status-badge"><div class="dot"></div> System Status: Updating</div></div>
<script>lucide.createIcons();</script></body></html>`);
        }
        next();
    } catch (e) { next(); }
});

// ─── API Browser Guard ─────────────────────────────────
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/rewards/')) return next();
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.status(404).send(notFoundHtml);
    }
    next();
});

// ─── Routes ────────────────────────────────────────────
app.use('/api/v1', robloxRoutes);         
app.use('/api/rewards', rewardsRoutes);   
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);                
app.use('/p', pageRoutes);

// ─── Auth Middleware for Pages ──────────────────────────
const requireAdmin = async (req, res, next) => {
    try {
        const token = req.cookies.kymor_token;
        if (!token) return res.redirect('/login');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) return res.redirect('/login');
        if (!user.isTwoFactorEnabled) return res.redirect('/dashboard?error=admin_requires_2fa');
        next(); 
    } catch (err) { return res.redirect('/login'); }
};

const redirectIfLoggedIn = (req, res, next) => {
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

// ─── Page Routes ───────────────────────────────────────
app.get('/admin', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'admin.html')));     
app.get('/login', redirectIfLoggedIn, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'login.html')));
app.get('/upgrade', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'upgrade.html')));
app.get('/reward/:hubId', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'reward.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'docs.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'main.html')));

// ─── SDK Endpoint (Polymorphic Lua Delivery) ───────────
app.get('/sdk/library.lua', (req, res) => {
    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('text/html')) return res.status(404).send(notFoundHtml);

    const sdkPath = path.join(__dirname, 'private', 'library.lua');
    fs.readFile(sdkPath, 'utf8', (err, rawLua) => {
        if (err) return res.status(404).send('game.Players.LocalPlayer:Kick("Kymor: SDK not found on server.")');

        const apiUrl = process.env.PUBLIC_URL || "https://kymor.dev/api/v1";
        const xorKey = Math.floor(Math.random() * 250) + 1; 
        const encryptedBytes = Array.from(apiUrl).map(char => char.charCodeAt(0) ^ xorKey);
        const byteArrayString = "{" + encryptedBytes.join(", ") + "}";

        const randomFuncName = "KymorDec_" + crypto.randomBytes(4).toString('hex');
        const decryptorLua = `
local function ${randomFuncName}()
    local bytes = ${byteArrayString}
    local str = ""
    for i = 1, #bytes do str = str .. string.char(bit32.bxor(bytes[i], ${xorKey})) end
    return str
end
`;
        let polymorphicLua = decryptorLua + rawLua.replace('"{{KYMOR_DYNAMIC_API_URL}}"', `${randomFuncName}()`);
        res.type('text/plain').send(polymorphicLua);
    });
});

// ─── Honeypot on all API routes ────────────────────────
app.use('/api', honeypotMiddleware);
app.use('/api', apiLimiter);

// ─── 404 Catch-All ─────────────────────────────────────
app.use((req, res) => { res.status(404).send(notFoundHtml); });

// ─── Error Handler ─────────────────────────────────────
app.use(errorHandler);

// ─── Database Connection & Start ───────────────────────
async function start() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to MySQL via Prisma');
        logger.db('Connected to MySQL');

        // Ensure platform config exists
        const configCount = await prisma.platformConfig.count();
        if (configCount === 0) {
            await prisma.platformConfig.create({ data: {} });
            console.log('📋 Created default platform config');
        }
    } catch (err) {
        console.error('❌ Database Error:', err.message);
        logger.error('Database connection failed', { error: err.message });
        process.exit(1);
    }

    // ─── WebSocket Authentication (from Panda-Websocket) ───
    const wsContext = setupWebSocket(server);
    setupWebSocketAPI(app, wsContext);
    logger.ws('WebSocket authentication system active');

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`🚀 Kymor server on port ${PORT}`);
        console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
        console.log(`📡 API: http://localhost:${PORT}/api`);
        logger.info(`Server started on port ${PORT}`);
    });

    if (process.env.DISCORD_TOKEN) bot.start();
}

start();

// ─── Graceful Shutdown ─────────────────────────────────
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});