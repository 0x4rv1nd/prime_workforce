import dotenv from 'dotenv';
import { User } from './src/models/User.js';
import { hashPassword, comparePassword, generateToken } from './src/utils/auth.js';
import mongoose from 'mongoose';

dotenv.config();

const test = async () => {
  await mongoose.connect('mongodb://localhost:27017/prime_workforce');
  console.log('Connected to MongoDB');

  // Test login
  const email = 'admin@prime.com';
  const password = 'superadmin123';

  const user = await User.findOne({ email });
  console.log('User found:', user ? 'Yes' : 'No');
  if (user) {
    console.log('User role:', user.role);
    console.log('User isApproved:', user.isApproved);
    
    const isMatch = await comparePassword(password, user.password);
    console.log('Password match:', isMatch);

    if (isMatch) {
      const token = generateToken(user);
      console.log('Token generated:', token.substring(0, 50) + '...');
    }
  }

  await mongoose.disconnect();
  process.exit(0);
};

test();