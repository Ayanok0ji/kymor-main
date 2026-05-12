import mongoose from 'mongoose';

const RewardSessionSchema = new mongoose.Schema({
    hub_id: { type: String, required: true },
    session_id: { type: String, required: true, unique: true },
    ip: { type: String, required: true },
    progress: { type: Number, default: 0 },
    key_earned: { type: String, default: null },
    
    step_started_at: { type: Date, default: null }, 
    action_token: { type: String, default: null }, 
    used_hashes: { type: [String], default: [] }, 
    
    step_times: { type: [Number], default: [] },
    cooldown_until: { type: Date, default: null },

    discord_id: { type: String, default: null },
    discord_username: { type: String, default: null },
    
    risk_score: { type: Number, default: 0 },
    requires_verification: { type: Boolean, default: false },
    
    expires_at: { type: Date, required: true },
    last_active: { type: Date, default: Date.now }
});

export default mongoose.models.RewardSession || mongoose.model('RewardSession', RewardSessionSchema);