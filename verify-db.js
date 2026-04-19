import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';

dotenv.config();

const verify = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log('Connecting to Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');

    // 1. Check all users and their roles
    const users = await User.find({}).select('email role isApproved');
    console.log('\n--- User Audit ---');
    users.forEach(u => {
      console.log(`Email: ${u.email} | Role: ${u.role} | Approved: ${u.isApproved}`);
    });

    // 2. Check if a SUPER_ADMIN exists for our testing
    const admin = users.find(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN');
    if (!admin) {
      console.log('\n❌ WARNING: No Admin found in database. Dashboard login will fail.');
    } else {
      console.log(`\n✅ Admin found: ${admin.email}`);
    }

    // 3. Verify backend approval logic
    const workers = users.filter(u => u.role === 'WORKER');
    const pendingWorkers = workers.filter(u => !u.isApproved);
    if (pendingWorkers.length > 0) {
      console.log(`\nℹ️ Found ${pendingWorkers.length} pending workers. They will need approval.`);
    }

    await mongoose.disconnect();
    console.log('\nVerification complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during verification:', err.message);
    process.exit(1);
  }
};

verify();
