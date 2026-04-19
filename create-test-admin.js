import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { hashPassword } from './src/utils/auth.js';

const createTestAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is missing');
    
    await mongoose.connect(mongoUri);
    console.log('Connected to Atlas');

    const email = 'testadmin@prime.com';
    const password = 'testadmin123';
    
    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      console.log('User already exists, updating password...');
      existing.password = await hashPassword(password);
      existing.role = 'ADMIN';
      existing.isApproved = true;
      await existing.save();
    } else {
      await User.create({
        name: 'Test Admin',
        email,
        password: await hashPassword(password),
        role: 'ADMIN',
        isApproved: true
      });
      console.log('Test Admin created successfully');
    }

    console.log('\n--- Credentials ---');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('-------------------\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

createTestAdmin();
