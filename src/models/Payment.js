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
    required: true,
    index: true 
  },
  totalHours: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  amount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'PAID', 'ON_HOLD'], 
    default: 'PENDING',
    index: true 
  },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ jobId: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);