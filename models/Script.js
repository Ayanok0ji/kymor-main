import mongoose from 'mongoose';

export default mongoose.model('Script', new mongoose.Schema({
    hub_id: { type: String, required: true }, 
    script_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    obfuscator: { type: String, enum: ['none', 'luacon'], default: 'none' },
    executions: { type: Number, default: 0 },
    
    is_active: { type: Boolean, default: true },
    
    createdAt: { type: Date, default: Date.now }
}));