import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { type: String, required: true, minlength: 6 },
  role: { 
    type: String, 
    enum: ['SUPER_ADMIN', 'ADMIN', 'CLIENT', 'WORKER'], 
    default: 'WORKER',
    index: true 
  },
  isApproved: { type: Boolean, default: false, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  phone: { type: String, trim: true },
  profileImage: { type: String },
  deletedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.index({ role: 1, isApproved: 1 });
userSchema.index({ createdAt: -1 });

userSchema.pre('find', function() {
  this.where({ isDeleted: false });
});

userSchema.pre('findOne', function() {
  this.where({ isDeleted: false });
});

export const User = mongoose.model('User', userSchema);