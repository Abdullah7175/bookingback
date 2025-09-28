// scripts/seed-admin.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI missing in .env');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true, trim: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin','agent','user'], default: 'admin' },
  name: { type: String, default: 'Admin' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

(async () => {
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'mydb' });

  const email = process.argv[2] || 'admin@example.com';
  const password = process.argv[3] || 'password123';

  const hash = await bcrypt.hash(password, 12);

  const doc = await User.findOneAndUpdate(
    { email },
    { email, passwordHash: hash, role: 'admin', name: 'Super Admin' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('✅ Admin ready:', { email: doc.email, role: doc.role });
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
