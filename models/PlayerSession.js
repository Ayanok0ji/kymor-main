import mongoose from 'mongoose';

const PlayerSessionSchema = new mongoose.Schema({
    hub_id: { type: String, required: true },
    hwid: { type: String, required: true },
    discord_id: { type: String, default: null },
    player_name: { type: String, default: 'Unknown' },
    executor: { type: String, default: 'Unknown' },
    game_name: { type: String, default: 'Unknown Game' },
    ip_address: { type: String, required: true },
    started_at: { type: Date, default: Date.now },
    last_ping: { type: Date, default: Date.now }
});

export default mongoose.models.PlayerSession || mongoose.model('PlayerSession', PlayerSessionSchema);