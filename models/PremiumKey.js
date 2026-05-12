import mongoose from 'mongoose';

const PremiumKeySchema = new mongoose.Schema({
    key_string: { type: String, required: true, unique: true },
    used: { type: Boolean, default: false },
    used_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    used_at: { type: Date, default: null },
    purchased_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Tracks who bought the gift key
    note: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('PremiumKey', PremiumKeySchema);