// Script to clean dummy data from MongoDB database
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI not found in .env file');
  process.exit(1);
}

async function cleanDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Available collections:', collections.map(c => c.name).join(', '));

    // Check agents collection
    console.log('\n🔍 Checking agents collection...');
    const agentsCollection = db.collection('agents');
    const agents = await agentsCollection.find({}).toArray();
    
    console.log(`\n📊 Found ${agents.length} agents in database:`);
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.name} (${agent.email}) - Created: ${agent.createdAt}`);
    });

    // Check for test/dummy data patterns
    const dummyPatterns = [
      /test/i,
      /dummy/i,
      /sample/i,
      /example/i,
      /fake/i,
      /demo/i
    ];

    const dummyAgents = agents.filter(agent => {
      const nameMatch = dummyPatterns.some(pattern => pattern.test(agent.name || ''));
      const emailMatch = dummyPatterns.some(pattern => pattern.test(agent.email || ''));
      return nameMatch || emailMatch;
    });

    if (dummyAgents.length > 0) {
      console.log(`\n🗑️  Found ${dummyAgents.length} dummy/test agents:`);
      dummyAgents.forEach(agent => {
        console.log(`   - ${agent.name} (${agent.email})`);
      });

      console.log('\n⚠️  Deleting dummy agents...');
      const dummyIds = dummyAgents.map(a => a._id);
      const deleteResult = await agentsCollection.deleteMany({ _id: { $in: dummyIds } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} dummy agents`);
    } else {
      console.log('\n✅ No dummy data found in agents collection');
    }

    // Check users collection
    console.log('\n🔍 Checking users collection...');
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}).toArray();
    
    console.log(`\n📊 Found ${users.length} users in database:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`);
    });

    // Check bookings
    console.log('\n🔍 Checking bookings collection...');
    const bookingsCollection = db.collection('bookings');
    const bookingsCount = await bookingsCollection.countDocuments();
    console.log(`📊 Found ${bookingsCount} bookings in database`);

    // List first 5 bookings
    if (bookingsCount > 0) {
      const sampleBookings = await bookingsCollection.find({}).limit(5).toArray();
      console.log('\n📋 Sample bookings:');
      sampleBookings.forEach((booking, index) => {
        console.log(`${index + 1}. ${booking.customerName} - ${booking.package} - ${booking.status}`);
      });
    }

    console.log('\n✅ Database cleaning complete!');
    console.log('\n📝 Summary:');
    console.log(`   - Total Agents: ${agents.length - (dummyAgents?.length || 0)}`);
    console.log(`   - Total Users: ${users.length}`);
    console.log(`   - Total Bookings: ${bookingsCount}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
cleanDatabase();

