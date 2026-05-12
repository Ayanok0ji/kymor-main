/**
 * Kymor Validators — Input Validation (from Panda's Joi pattern)
 */
import Joi from 'joi';

// ─── Auth Validators ───────────────────────────────────

export const registerValidator = Joi.object({
    username: Joi.string().alphanum().min(3).max(20).required()
        .messages({ 'string.pattern.base': 'Username can only contain letters and numbers' }),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required(),
    acceptedTOS: Joi.boolean().valid(true).required()
        .messages({ 'any.only': 'You must accept the Terms of Service' })
});

export const loginValidator = Joi.object({
    identifier: Joi.string().min(3).max(128).required(),
    password: Joi.string().min(1).max(128).required()
});

export const resetPasswordValidator = Joi.object({
    userId: Joi.string().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    newPassword: Joi.string().min(6).max(128).required()
});

export const otpValidator = Joi.object({
    userId: Joi.string().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required()
});

// ─── Hub Validators ────────────────────────────────────

export const createHubValidator = Joi.object({
    name: Joi.string().min(2).max(50).required()
});

export const updateHubValidator = Joi.object({
    name: Joi.string().min(2).max(50),
    webhookUrl: Joi.string().uri().allow('').max(512),
    paused: Joi.boolean()
}).min(1);

// ─── Key Validators ────────────────────────────────────

export const createKeyValidator = Joi.object({
    amount: Joi.number().integer().min(1).max(100).default(1),
    duration_hours: Joi.number().integer().min(1).max(8760).allow(null), // max 1 year
    note: Joi.string().max(512).allow('').default(''),
    non_hwid: Joi.boolean().default(false),
    bound_script_id: Joi.string().max(32).allow(null, '')
});

export const updateKeyValidator = Joi.object({
    status: Joi.string().valid('ACTIVE', 'BANNED', 'EXPIRED'),
    note: Joi.string().max(512).allow(''),
    hwid: Joi.string().max(512).allow(null, '')
}).min(1);

// ─── Script Validators ────────────────────────────────

export const createScriptValidator = Joi.object({
    name: Joi.string().min(1).max(256).required(),
    code: Joi.string().min(1).max(5242880).required() // 5MB max
});

export const updateScriptValidator = Joi.object({
    name: Joi.string().min(1).max(256),
    code: Joi.string().min(1).max(5242880),
    isActive: Joi.boolean()
}).min(1);

// ─── Rewards Validators ───────────────────────────────

export const rewardsConfigValidator = Joi.object({
    enabled: Joi.boolean(),
    max_keys: Joi.number().integer().min(1).max(100),
    enable_free_keys: Joi.boolean(),
    key_duration_seconds: Joi.number().integer().min(0).max(31536000), // max 1 year
    add_time_seconds: Joi.number().integer().min(0).max(604800), // max 7 days
    max_time_seconds: Joi.number().integer().min(0).max(2592000), // max 30 days
    cooldown_seconds: Joi.number().integer().min(0).max(86400), // max 1 day
    checkpoint_timeout_mins: Joi.number().integer().min(5).max(1440),
    allow_browser_reset: Joi.boolean(),
    require_discord: Joi.boolean()
}).min(1);

export const checkpointValidator = Joi.object({
    provider: Joi.string().valid('LINKVERTISE', 'LOOTLABS', 'WORK_INK', 'SHRTFLY').required(),
    short_url: Joi.string().uri().required(),
    api_token: Joi.string().max(512).allow('')
});

// ─── Page Builder Validators ──────────────────────────

export const pageConfigValidator = Joi.object({
    published: Joi.boolean(),
    title: Joi.string().max(100),
    slug: Joi.string().pattern(/^[a-z0-9-]+$/).max(128).allow(''),
    key_mode: Joi.string().valid('free', 'paid', 'both'),
    buy_link: Joi.string().uri().allow('').max(512),
    accent_color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).max(16),
    description: Joi.string().max(5000).allow(''),
    elements: Joi.array().items(Joi.object())
}).min(1);

// ─── Settings Validators (from Panda) ─────────────────

export const securitySettingsValidator = Joi.object({
    adblocker: Joi.boolean().default(false),
    antiTamper: Joi.boolean().default(false),
    agentLock: Joi.boolean().default(false),
    allowIpVerify: Joi.boolean().default(false),
    allowCheckHwid: Joi.boolean().default(false),
    captchaType: Joi.string().valid('NO_CAPTCHA', 'CLOUDFLARE', 'HCAPTCHA', 'GEETEST').default('CLOUDFLARE'),
    challengeToGetKey: Joi.boolean().default(false),
    discordChallenge: Joi.boolean().default(false)
});

// ─── Blacklist Validators ─────────────────────────────

export const blacklistValidator = Joi.object({
    target: Joi.string().min(1).max(512).required(),
    reason: Joi.string().max(512).default('Manual ban')
});

// ─── Admin Validators ─────────────────────────────────

export const platformConfigValidator = Joi.object({
    clientId: Joi.string().max(64).allow(''),
    clientSecret: Joi.string().max(128).allow(''),
    paypalClientId: Joi.string().max(128).allow(''),
    paypalClientSecret: Joi.string().max(128).allow(''),
    paymongoSecretKey: Joi.string().max(128).allow(''),
    maintenanceMode: Joi.boolean()
}).min(1);

// ─── Validation Middleware Factory ─────────────────────

export const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
        const messages = error.details.map(d => d.message).join(', ');
        return res.status(400).json({ error: messages });
    }
    req.validatedBody = value;
    next();
};
