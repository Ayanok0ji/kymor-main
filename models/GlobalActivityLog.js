import mongoose from 'mongoose';

const GlobalActivityLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String, default: 'System' },
    action: { type: String, required: true },
    details: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('GlobalActivityLog', GlobalActivityLogSchema);