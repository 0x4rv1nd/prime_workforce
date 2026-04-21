import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true 
  },
  assignedAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  companyName: { type: String, required: true, trim: true, maxlength: 200 },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactPhone: { type: String, trim: true },
  companyAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  industry: { type: String, trim: true },
  isVerified: { type: Boolean, default: false, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

clientSchema.index({ companyName: 'text' });
clientSchema.index({ contactEmail: 1 }, { unique: true });

clientSchema.pre('find', function() {
  this.where({ isDeleted: false });
});

clientSchema.pre('findOne', function() {
  this.where({ isDeleted: false });
});

export const Client = mongoose.model('Client', clientSchema);