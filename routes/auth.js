const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['senior', 'contributor', 'admin'])
    .withMessage('Role must be either "senior", "contributor", or "admin"')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'fallback-secret-key',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input data',
      details: errors.array()
    });
  }
  next();
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, role = 'senior' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'A user with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      role
    });

    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Return user data without password
    const userResponse = user.getPublicProfile();

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account deactivated',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate JWT token
    const token = generateToken(user._id);

    // Return user data without password
    const userResponse = user.getPublicProfile();

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    const userResponse = req.user.getPublicProfile();
    
    res.json({
      message: 'User profile retrieved successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: 'An error occurred while retrieving profile'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', authenticate, async (req, res) => {
  try {
    // Generate new token
    const token = generateToken(req.user._id);
    
    res.json({
      message: 'Token refreshed successfully',
      token
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'An error occurred while refreshing token'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
  try {
    // In a more sophisticated setup, you might maintain a blacklist of tokens
    // For now, just return success - the client should remove the token
    
    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

// @route   PUT /api/auth/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', authenticate, [
  body('language')
    .optional()
    .isIn(['en', 'zh'])
    .withMessage('Language must be "en" or "zh"'),
  body('fontSize')
    .optional()
    .isIn(['small', 'medium', 'large'])
    .withMessage('Font size must be "small", "medium", or "large"'),
  body('highContrast')
    .optional()
    .isBoolean()
    .withMessage('High contrast must be a boolean'),
  body('notifications')
    .optional()
    .isBoolean()
    .withMessage('Notifications must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const { language, fontSize, highContrast, notifications } = req.body;
    
    const user = req.user;
    
    // Update preferences
    if (language !== undefined) user.preferences.language = language;
    if (fontSize !== undefined) user.preferences.fontSize = fontSize;
    if (highContrast !== undefined) user.preferences.highContrast = highContrast;
    if (notifications !== undefined) user.preferences.notifications = notifications;
    
    await user.save();
    
    const userResponse = user.getPublicProfile();
    
    res.json({
      message: 'Preferences updated successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({
      error: 'Preferences update failed',
      message: 'An error occurred while updating preferences'
    });
  }
});

// @route   GET /api/auth/stats
// @desc    Get authentication and user statistics
// @access  Private (Admin only would be better, but for demo purposes)
router.get('/stats', authenticate, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const seniorUsers = await User.countDocuments({ role: 'senior' });
    const contributorUsers = await User.countDocuments({ role: 'contributor' });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });
    
    res.json({
      message: 'Statistics retrieved successfully',
      stats: {
        totalUsers,
        activeUsers,
        recentUsers,
        usersByRole: {
          senior: seniorUsers,
          contributor: contributorUsers,
          admin: adminUsers
        }
      }
    });
  } catch (error) {
    console.error('Stats retrieval error:', error);
    res.status(500).json({
      error: 'Stats retrieval failed',
      message: 'An error occurred while retrieving statistics'
    });
  }
});

module.exports = router;