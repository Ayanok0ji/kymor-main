import mongoose from 'mongoose';

const executionLogSchema = new mongoose.Schema({
    hub_id: { type: String, required: true },
    script_id: { type: String, required: true },
    script_name: { type: String, default: 'Unknown' },
    key_string: { type: String, required: true },
    executor: { type: String, default: 'Unknown' },
    hwid: { type: String, default: 'Unknown' },
    
    country: { type: String, default: 'Unknown' },
    lat: { type: Number, default: 0 },
    lon: { type: Number, default: 0 },
    
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
    },

    createdAt: { type: Date, default: Date.now }
});

executionLogSchema.index({ location: '2dsphere' });

export default mongoose.model('ExecutionLog', executionLogSchema);