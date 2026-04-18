import dotenv from 'dotenv';
import { User } from './src/models/User.js';
import { hashPassword } from './src/utils/auth.js';
import mongoose from 'mongoose';

dotenv.config();

const fixAdmin = async () => {
  await mongoose.connect('mongodb://localhost:27017/prime_workforce');
  console.log('Connected to MongoDB');

  // Find and update the super admin
  const hashedPassword = await hashPassword('superadmin123');
  
  const user = await User.findOneAndUpdate(
    { role: 'SUPER_ADMIN' },
    { password: hashedPassword },
    { new: true }
  );

  if (user) {
    console.log('Super admin updated');
    console.log('Email:', user.email);
    console.log('Role:', user.role);
  } else {
    // Create new super admin
    const newUser = await User.create({
      name: 'Super Admin',
      email: 'admin@prime.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isApproved: true
    });
    console.log('Super admin created');
    console.log('Email:', newUser.email);
  }

  await mongoose.disconnect();
  process.exit(0);
};

fixAdmin();