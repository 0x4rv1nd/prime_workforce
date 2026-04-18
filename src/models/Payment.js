import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  jobId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Job',
    index: true 
  },
  attendanceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Attendance' 
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  type: { 
    type: String, 
    enum: ['WAGE', 'BONUS', 'DEDUCTION', 'ADVANCE'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'], 
    default: 'PENDING',
    index: true 
  },
  method: { 
    type: String, 
    enum: ['BANK_TRANSFER', 'CASH', 'CHECK', 'MOBILE_MONEY'] 
  },
  reference: { type: String, unique: true, sparse: true },
  description: { type: String },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ jobId: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);