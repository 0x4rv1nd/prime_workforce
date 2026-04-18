import mongoose from 'mongoose';

const availabilitySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  date: { type: Date, required: true, index: true },
  isAvailable: { type: Boolean, default: true },
  shift: {
    start: { type: String }, // "09:00"
    end: { type: String }    // "17:00"
  },
  reason: { type: String } // If not available
}, {
  timestamps: true
});

availabilitySchema.index({ userId: 1, date: 1 }, { unique: true });

export const Availability = mongoose.model('Availability', availabilitySchema);