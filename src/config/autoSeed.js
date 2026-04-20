import { User } from '../models/User.js';
import { hashPassword } from '../utils/auth.js';

export const autoSeed = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 No users found. Seeding initial demo data...');
      
      const adminPassword = await hashPassword('admin123');
      const clientPassword = await hashPassword('client123');
      const promoterPassword = await hashPassword('promoter123');

      const demoUsers = [
        {
          name: 'Super Admin',
          email: 'admin@prime.com',
          password: adminPassword,
          role: 'SUPER_ADMIN',
          isApproved: true
        },
        {
          name: 'Demo Client',
          email: 'testclient@prime.com',
          password: clientPassword,
          role: 'CLIENT',
          isApproved: true
        },
        {
          name: 'Demo Promoter',
          email: 'promoter@prime.com',
          password: promoterPassword,
          role: 'PROMOTER',
          isApproved: true
        }
      ];

      await User.insertMany(demoUsers);
      console.log('✅ Demo users seeded successfully:');
      console.log('   - Admin: admin@prime.com / admin123');
      console.log('   - Client: testclient@prime.com / client123');
      console.log('   - Promoter: promoter@prime.com / promoter123');
    }
  } catch (error) {
    console.error('❌ Error during auto-seeding:', error.message);
  }
};
