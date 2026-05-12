import mongoose from 'mongoose';

const blacklistSchema = new mongoose.Schema({
    ip: { type: String, sparse: true },
    hwid: { type: String, sparse: true },
    reason: { type: String, default: 'Automated Security Ban' },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Blacklist', blacklistSchema);