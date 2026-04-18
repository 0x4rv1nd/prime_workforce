import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { Job } from '../models/Job.js';
import { hashPassword } from '../utils/auth.js';

dotenv.config();

const seedTestData = async () => {
  try {
    await connectDB();

    const data = [
      {
        name: 'Test Admin',
        email: 'admin_test@prime.com',
        password: 'AdminTest@123',
        role: 'ADMIN',
        isApproved: true,
        phone: '0001112222'
      },
      {
        name: 'Test Client',
        email: 'client1@prime.com',
        password: 'Client@1212',
        role: 'CLIENT',
        isApproved: true,
        phone: '1112223333',
        clientData: {
          companyName: 'Prime Testing Corp',
          contactEmail: 'corp@primetesting.com',
          contactPhone: '555-0101',
          companyAddress: {
            street: '123 Tech Lane',
            city: 'Innovation City',
            state: 'California',
            zipCode: '90210',
            country: 'USA'
          },
          industry: 'Software Quality Assurance'
        }
      },
      {
        name: 'Test Worker',
        email: 'worker1@prime.com',
        password: 'Worker@1212',
        role: 'WORKER',
        isApproved: true,
        phone: '4445556666'
      },
      {
        name: 'Test User',
        email: 'testuser@prime.com',
        password: 'User@123',
        role: 'WORKER',
        isApproved: true,
        phone: '7778889999'
      }
    ];

    console.log('Seeding test data...');

    for (const item of data) {
      const existingUser = await User.findOne({ email: item.email });

      if (existingUser) {
        console.log(`[SKIPPED] User with email ${item.email} already exists.`);
        continue;
      }

      const hashedPassword = await hashPassword(item.password);
      const user = new User({
        name: item.name,
        email: item.email,
        password: hashedPassword,
        role: item.role,
        isApproved: item.isApproved,
        phone: item.phone
      });

      const savedUser = await user.save();
      console.log(`[SUCCESS] Created User: ${item.name} (${item.role})`);

      // If it's a client, create the Client profile
      if (item.role === 'CLIENT' && item.clientData) {
        const client = new Client({
          userId: savedUser._id,
          ...item.clientData
        });
        await client.save();
        console.log(`[SUCCESS] Created Client Profile for: ${item.clientData.companyName}`);
      }
    }

    // Seed a Job if at least one client exists
    const client = await Client.findOne();
    if (client) {
      const existingJob = await Job.findOne({ title: 'Initial Maintenance Job' });
      if (!existingJob) {
        const job = new Job({
          title: 'Initial Maintenance Job',
          description: 'This is a test maintenance job seeded for demonstration.',
          clientId: client._id,
          location: {
            address: '123 Tech Lane, Innovation City, CA',
            lat: 34.0522,
            lng: -118.2437,
            radius: 500
          },
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          wage: {
            amount: 25,
            currency: 'USD',
            type: 'HOURLY'
          },
          requiredWorkers: 2,
          skills: ['Maintenance', 'Safety'],
          status: 'PENDING'
        });
        await job.save();
        console.log(`[SUCCESS] Created Sample Job: ${job.title}`);
      } else {
        console.log('[SKIPPED] Sample Job already exists.');
      }
    }

    console.log('-----------------------------------------------');
    console.log('Test data seeding complete!');
    console.log('-----------------------------------------------');

  } catch (error) {
    console.error(`[ERROR] Seeding test data failed: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  }
};

seedTestData();
