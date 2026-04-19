import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { hashPassword } from './src/utils/auth.js';

dotenv.config();

const resetAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    await mongoose.connect(mongoUri);
    
    const hashedPassword = await hashPassword('superadmin123');
    
    await User.findOneAndUpdate(
      { email: 'admin@prime.com' },
      { password: hashedPassword }
    );

    console.log('✅ Password for admin@prime.com reset to: superadmin123');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

resetAdmin();
