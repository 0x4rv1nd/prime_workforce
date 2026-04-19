import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { hashPassword } from './src/utils/auth.js';

const setupDemoUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to Atlas');

    const demoUsers = [
      { name: 'Demo Admin', email: 'testadmin@prime.com', password: 'testadmin123', role: 'ADMIN' },
      { name: 'Demo Worker', email: 'testworker@prime.com', password: 'testworker123', role: 'WORKER' },
      { name: 'Demo Client', email: 'testclient@prime.com', password: 'testclient123', role: 'CLIENT' }
    ];

    for (const u of demoUsers) {
      const existing = await User.findOne({ email: u.email });
      const hashedPassword = await hashPassword(u.password);
      if (existing) {
        existing.password = hashedPassword;
        existing.role = u.role;
        existing.isApproved = true;
        await existing.save();
        console.log(`Updated ${u.role}: ${u.email}`);
      } else {
        await User.create({
          name: u.name,
          email: u.email,
          password: hashedPassword,
          role: u.role,
          isApproved: true
        });
        console.log(`Created ${u.role}: ${u.email}`);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

setupDemoUsers();
