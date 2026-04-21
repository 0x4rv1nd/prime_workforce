import { MongoMemoryServer } from 'mongodb-memory-server';

async function test() {
  try {
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log('Memory Server URI:', uri);
    await mongoServer.stop();
    console.log('Success!');
  } catch (err) {
    console.error('Failed:', err);
  }
}

test();
