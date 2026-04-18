import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/auth.js';

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    // Connect to database
    await connectDB();

    const adminEmail = 'admin@prime.com';
    const adminPassword = 'Admin@123';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      if (existingAdmin.role !== 'SUPER_ADMIN') {
        console.log(`[INFO] Updating existing admin ${adminEmail} to SUPER_ADMIN role.`);
        existingAdmin.role = 'SUPER_ADMIN';
        await existingAdmin.save();
        console.log('[SUCCESS] Role updated successfully.');
      } else {
        console.log(`[INFO] Super Admin with email ${adminEmail} already exists and has correct role.`);
      }
      process.exit(0);
    }

    // Create Super Admin
    const hashedPassword = await hashPassword(adminPassword);
    
    const superAdmin = new User({
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isApproved: true,
      phone: '1234567890'
    });

    await superAdmin.save();

    console.log('-----------------------------------------------');
    console.log('Super Admin seeded successfully!');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log('Role: SUPER_ADMIN');
    console.log('-----------------------------------------------');

  } catch (error) {
    console.error(`[ERROR] Seeding failed: ${error.message}`);
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  }
};

seedSuperAdmin();
