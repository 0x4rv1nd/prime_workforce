import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema({
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
  assignedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  assignedAt: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'], 
    default: 'PENDING',
    index: true 
  },
  startedAt: { type: Date },
  completedAt: { type: Date }
}, {
  timestamps: true
});

assignmentSchema.index({ userId: 1, jobId: 1 }, { unique: true });
assignmentSchema.index({ jobId: 1, status: 1 });

export const Assignment = mongoose.model('Assignment', assignmentSchema);