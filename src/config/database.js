import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

dotenv.config();

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable not set');
    }
    
    console.log('Attempting to connect to MongoDB...');
    
    // Attempt local/remote connection
    try {
      const conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
        family: 4 // Force IPv4
      });
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (localError) {
      console.error(`❌ Connection failed: ${localError.message}`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ Primary connection failed. Starting In-Memory MongoDB fallback...');
        const mongoServer = await MongoMemoryServer.create();
        const memoryUri = mongoServer.getUri();
        const conn = await mongoose.connect(memoryUri);
        console.log(`🚀 MongoDB Connected (In-Memory): ${conn.connection.host}`);
        console.log('💡 Note: All data will be lost when the server restarts.');
        return conn;
      }
      throw localError;
    }
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};


export default connectDB;