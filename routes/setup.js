const express = require('express');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/setup/create-admin
// @desc    Create admin user (one-time setup)
// @access  Public (but should be secured in production)
router.post('/create-admin', async (req, res) => {
  try {
    // Admin user details
    const adminData = {
      name: 'Admin User',
      email: 'admin@lovealways.com',
      password: 'admin123',
      role: 'admin',
      isEmailVerified: true
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      return res.json({
        message: 'Admin user already exists',
        admin: {
          email: existingAdmin.email,
          name: existingAdmin.name,
          role: existingAdmin.role,
          createdAt: existingAdmin.createdAt
        }
      });
    }

    // Create admin user
    const adminUser = new User(adminData);
    await adminUser.save();

    res.status(201).json({
      message: 'Admin user created successfully!',
      admin: {
        email: adminData.email,
        password: adminData.password, // Only show in response for setup
        role: adminData.role,
        name: adminData.name
      },
      instructions: 'You can now login with these credentials in your mobile app!'
    });

  } catch (error) {
    console.error('Admin creation error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'An admin user with this email already exists'
      });
    }

    res.status(500).json({
      error: 'Admin creation failed',
      message: 'An error occurred while creating admin user'
    });
  }
});

// @route   GET /api/setup/admin-status
// @desc    Check if admin user exists
// @access  Public
router.get('/admin-status', async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });
    const adminUser = await User.findOne({ role: 'admin' }, 'name email createdAt');

    res.json({
      hasAdmin: adminCount > 0,
      adminCount,
      admin: adminUser ? {
        name: adminUser.name,
        email: adminUser.email,
        createdAt: adminUser.createdAt
      } : null
    });
  } catch (error) {
    console.error('Admin status check error:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: 'Unable to check admin status'
    });
  }
});

module.exports = router;