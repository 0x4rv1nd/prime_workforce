import mongoose from 'mongoose';

const jobApplicationSchema = new mongoose.Schema({
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
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'PENDING',
    index: true 
  },
  appliedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Prevent duplicate applications for the same job by a user
jobApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);
