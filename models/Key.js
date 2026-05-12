import mongoose from 'mongoose';

export default mongoose.model('Key', new mongoose.Schema({
    hub_id: { type: String, required: true },
    key_string: { type: String, required: true, unique: true },
    hwid: { type: String, default: null },
    executions: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'BANNED'], default: 'ACTIVE' },
    expires_at: { type: Date, default: null },
    bound_script_id: { type: String, default: null },
    non_hwid: { type: Boolean, default: false },
    note: { type: String, default: '' },
    discord_id: { type: String, default: null },
    is_trial: { type: Boolean, default: false },
    last_hwid_reset: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    ip_address: { type: String, default: null }
}));