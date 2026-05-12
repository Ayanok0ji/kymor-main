import mongoose from 'mongoose';
import crypto from 'crypto';

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    api_key: { type: String, default: () => crypto.randomBytes(16).toString('hex') },
    isPremium: { type: Boolean, default: false },
    
    role: { 
        type: String, 
        enum: ['user', 'moderator', 'admin'], 
        default: 'user' 
    },
    
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String, default: null },
    verificationOtpExpire: { type: Date, default: null },
    
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorOtp: { type: String, default: null },
    twoFactorOtpExpire: { type: Date, default: null },
    
    resetOtp: { type: String, default: null },
    resetOtpExpire: { type: Date, default: null },
    
    acceptedTOS: { type: Boolean, default: false },

    obfuscations_today: { type: Number, default: 0 },
    last_obfuscation_date: { type: Date, default: null },

    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);