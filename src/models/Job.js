import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 2000 },
  location: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    radius: { type: Number, default: 500 },
    googleMapsLink: { type: String }
  },
  dressCode: { type: String },
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true,
    index: true 
  },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  shiftStart: { type: String, default: '09:00' }, // HH:mm format
  shiftEnd: { type: String, default: '17:00' },   // HH:mm format
  status: { 
    type: String, 
    enum: ['PENDING', 'OPEN', 'ACTIVE', 'COMPLETED', 'CANCELLED'], 
    default: 'PENDING',
    index: true 
  },
  wage: {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    type: { type: String, enum: ['HOURLY', 'DAILY', 'FIXED'], default: 'HOURLY' }
  },
  requiredWorkers: { type: Number, default: 1, min: 1 },
  skills: [{ type: String, trim: true }],
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

jobSchema.index({ clientId: 1, status: 1 });
jobSchema.index({ startDate: 1, endDate: 1 });
jobSchema.index({ title: 'text', description: 'text' });

jobSchema.pre('find', function() {
  this.where({ isDeleted: false });
});

jobSchema.pre('findOne', function() {
  this.where({ isDeleted: false });
});

export const Job = mongoose.model('Job', jobSchema);