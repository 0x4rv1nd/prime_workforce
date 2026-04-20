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
      { name: 'Demo Worker', email: 'testworker@prime.com', password: 'testworker123', role: 'PROMOTER' },
      { name: 'Demo Client', email: 'testclient@prime.com', password: 'testclient123', role: 'CLIENT' }
    ];

    let adminId;
    for (const u of demoUsers) {
      const existing = await User.findOne({ email: u.email });
      const hashedPassword = await hashPassword(u.password);
      let user;
      if (existing) {
        existing.password = hashedPassword;
        existing.role = u.role;
        existing.isApproved = true;
        user = await existing.save();
        console.log(`Updated ${u.role}: ${u.email}`);
      } else {
        user = await User.create({
          name: u.name,
          email: u.email,
          password: hashedPassword,
          role: u.role,
          isApproved: true
        });
        console.log(`Created ${u.role}: ${u.email}`);
      }
      if (u.role === 'ADMIN') adminId = user._id;
      if (u.role === 'CLIENT') {
        const { Client } = await import('./src/models/Client.js');
        const existingClient = await Client.findOne({ userId: user._id });
        if (!existingClient) {
          await Client.create({
            userId: user._id,
            companyName: 'Test Company',
            contactEmail: u.email,
            assignedAdminId: adminId
          });
          console.log(`Created Client profile for ${u.email} and assigned to Admin`);
        } else {
            existingClient.assignedAdminId = adminId;
            await existingClient.save();
        }
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
