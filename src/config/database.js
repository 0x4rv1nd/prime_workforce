import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

dotenv.config();

let mongod = null;

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;
    
    // If no URI is provided or it's the default local one, and we're in development, 
    // try to use Memory Server if local connection fails
    if (!mongoUri || mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
      try {
        console.log('Attempting to connect to local MongoDB...');
        // Short timeout for local connection check
        const conn = await mongoose.connect(mongoUri || 'mongodb://localhost:27017/prime_workforce', {
          serverSelectionTimeoutMS: 2000 
        });
        console.log(`✅ MongoDB Connected (Local): ${conn.connection.host}`);
        return conn;
      } catch (localError) {
        console.log('⚠️ Local MongoDB not found. Starting In-Memory MongoDB Server...');
        mongod = await MongoMemoryServer.create();
        mongoUri = mongod.getUri();
        process.env.MONGO_URI = mongoUri; // Update env for other scripts
      }
    }

    if (!mongoUri) {
      throw new Error('MONGO_URI not defined and Memory Server failed to start');
    }

    const conn = await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB Connected (${mongod ? 'In-Memory' : 'Remote'}): ${conn.connection.host}`);
    
    if (mongod) {
      console.log('---');
      console.log('ℹ️ NOTE: Using a temporary in-memory database. Data will be lost on restart.');
      console.log('ℹ️ Connection String:', mongoUri);
      console.log('---');
    }

    return conn;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;