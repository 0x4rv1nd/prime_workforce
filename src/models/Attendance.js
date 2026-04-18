import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
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
  assignmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Assignment',
    required: true 
  },
  date: { 
    type: Date, 
    required: true, 
    default: () => new Date().setHours(0,0,0,0),
    index: true 
  },
  checkIn: {
    time: { type: Date },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String }
    },
    verified: { type: Boolean, default: false },
    notes: { type: String }
  },
  checkOut: {
    time: { type: Date },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String }
    },
    verified: { type: Boolean, default: false },
    notes: { type: String }
  },
  totalHours: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE'], 
    default: 'PRESENT',
    index: true 
  },
  overtime: { type: Number, default: 0 },
  breakDuration: { type: Number, default: 0 } // in minutes
}, {
  timestamps: true
});

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ jobId: 1, date: 1 });
attendanceSchema.index({ assignmentId: 1 });

export const Attendance = mongoose.model('Attendance', attendanceSchema);