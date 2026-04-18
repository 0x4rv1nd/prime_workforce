import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { hashPassword } from './src/utils/auth.js';

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/prime_workforce');
    console.log('Connected to MongoDB');

    const superAdminEmail = 'superadmin@primeworkforce.com';
    
    const existingSuperAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    
    if (existingSuperAdmin) {
      console.log('Super Admin already exists');
      console.log('Email:', existingSuperAdmin.email);
    } else {
      const hashedPassword = await hashPassword('superadmin123');
      
      const superAdmin = await User.create({
        name: 'Super Admin',
        email: superAdminEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isApproved: true
      });
      
      console.log('Super Admin created successfully');
      console.log('Email:', superAdmin.email);
      console.log('Password: superadmin123');
    }
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

seedSuperAdmin();