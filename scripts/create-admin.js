const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Admin user details
const ADMIN_USER = {
  name: 'Admin User',
  email: 'admin@lovealways.com',
  password: 'admin123',
  role: 'admin',
  isEmailVerified: true
};

async function createAdmin() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-always';
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: ADMIN_USER.email });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', ADMIN_USER.email);
      console.log('📋 Admin details:');
      console.log('   Email:', existingAdmin.email);
      console.log('   Name:', existingAdmin.name);
      console.log('   Role:', existingAdmin.role);
      console.log('   Created:', existingAdmin.createdAt);
      process.exit(0);
    }

    // Create admin user
    console.log('👤 Creating admin user...');
    const adminUser = new User(ADMIN_USER);
    await adminUser.save();

    console.log('🎉 Admin user created successfully!');
    console.log('📋 Admin Login Details:');
    console.log('   Email:', ADMIN_USER.email);
    console.log('   Password:', ADMIN_USER.password);
    console.log('   Role:', ADMIN_USER.role);
    console.log('');
    console.log('💡 You can now login with these credentials in your mobile app!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.code === 11000) {
      console.log('⚠️  A user with this email already exists');
    }
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
createAdmin();