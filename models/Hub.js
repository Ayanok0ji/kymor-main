import mongoose from 'mongoose';
import crypto from 'crypto';

const HubSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    short_id: { type: String, required: true, unique: true },
    api_key: { type: String, default: () => crypto.randomBytes(16).toString('hex') },
    webhook_url: { type: String, default: "" },
    paused: { type: Boolean, default: false },
    
    stats: { 
        online: { type: Number, default: 0 }, 
        executions: { type: Number, default: 0 }, 
        scripts: { type: Number, default: 0 }, 
        keys: { type: Number, default: 0 } 
    },
    
    rewards: {
        enabled: { type: Boolean, default: false },
        max_keys: { type: Number, default: 2 }, 
        enable_free_keys: { type: Boolean, default: false },
        key_duration_seconds: { type: Number, default: 0 },
        add_time_seconds: { type: Number, default: 21600 },
        max_time_seconds: { type: Number, default: 86400 },
        cooldown_seconds: { type: Number, default: 0 },
        checkpoint_timeout_mins: { type: Number, default: 70 },
        allow_browser_reset: { type: Boolean, default: true },
        require_discord_auth: { type: Boolean, default: false },
        checkpoints: [{
            provider: { type: String, enum: ['Linkvertise', 'Lootlabs', 'Work.Ink', 'ShrtFly'] },
            short_url: { type: String, required: true },
            api_token: { type: String, default: '' },
            completed_count: { type: Number, default: 0 },
            cancelled_count: { type: Number, default: 0 }
        }]
    },

    page: {
        published: { type: Boolean, default: false },
        title: { type: String, default: 'Untitled Hub' },
        slug: { type: String, default: '' },
        key_mode: { type: String, enum: ['none', 'free', 'paid'], default: 'free' },
        buy_link: { type: String, default: '' },
        accent_color: { type: String, default: '#14b8a6' },
        description: { type: String, default: '' },
        elements: [{
            id: { type: String, required: true },
            type: { type: String, required: true },
            data: { type: mongoose.Schema.Types.Mixed, default: {} },
            order: { type: Number, default: 0 }
        }]
    },
    
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Hub || mongoose.model('Hub', HubSchema);