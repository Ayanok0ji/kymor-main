import mongoose from 'mongoose';

const PlatformConfigSchema = new mongoose.Schema({
    discordClientId: { type: String, default: '' },
    discordClientSecret: { type: String, default: '' },
    paypalClientId: { type: String, default: '' },
    paypalClientSecret: { type: String, default: '' },
    paymongoSecretKey: { type: String, default: '' },
    maintenanceMode: { type: Boolean, default: false },
    authorized_ips: { type: [String], default: [] }
}, { timestamps: true });

export default mongoose.model('PlatformConfig', PlatformConfigSchema);