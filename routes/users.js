const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Song = require('../models/Song');
const { authenticate, authorize, requireOwnershipOrAdmin } = require('../middleware/auth');
const { uploadProfileImage, cleanupFiles } = require('../middleware/upload');

const router = express.Router();

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

// Validation rules for profile updates
const profileUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('birthYear')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage('Birth year must be between 1900 and current year')
];

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private (Admin)
router.get('/', authenticate, authorize('admin'), [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('role')
    .optional()
    .isIn(['senior', 'contributor', 'admin'])
    .withMessage('Role filter must be senior, contributor, or admin'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive filter must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      isActive
    } = req.query;

    // Build query
    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const users = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers: total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Users retrieval error:', error);
    res.status(500).json({
      error: 'Users retrieval failed',
      message: 'An error occurred while retrieving users'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user profile by ID
// @access  Public (for basic profile info)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      isActive: true
    }).select('name profile role stats createdAt');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user could not be found'
      });
    }

    // Get user's uploaded songs count
    const songsCount = await Song.countDocuments({
      uploadedBy: user._id,
      status: 'approved',
      isActive: true
    });

    const userProfile = user.toObject();
    userProfile.songsCount = songsCount;

    res.json({
      message: 'User profile retrieved successfully',
      data: { user: userProfile }
    });

  } catch (error) {
    console.error('User profile retrieval error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid user ID',
        message: 'The provided user ID is not valid'
      });
    }
    res.status(500).json({
      error: 'User profile retrieval failed',
      message: 'An error occurred while retrieving user profile'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user profile
// @access  Private (Own profile or Admin)
router.put('/:id', 
  authenticate, 
  profileUpdateValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Check if user can edit this profile
      if (req.params.id !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only edit your own profile'
        });
      }

      const { name, bio, birthYear } = req.body;

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'The requested user could not be found'
        });
      }

      // Update fields
      if (name !== undefined) user.name = name;
      if (bio !== undefined) user.profile.bio = bio;
      if (birthYear !== undefined) user.profile.birthYear = birthYear;

      await user.save();

      const userResponse = user.getPublicProfile();

      res.json({
        message: 'Profile updated successfully',
        data: { user: userResponse }
      });

    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({
        error: 'Profile update failed',
        message: 'An error occurred while updating profile'
      });
    }
  }
);

// @route   POST /api/users/:id/avatar
// @desc    Upload user avatar
// @access  Private (Own profile or Admin)
router.post('/:id/avatar',
  authenticate,
  uploadProfileImage,
  cleanupFiles,
  async (req, res) => {
    try {
      // Check if user can edit this profile
      if (req.params.id !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only edit your own profile'
        });
      }

      if (!req.uploadedImage) {
        return res.status(400).json({
          error: 'No image provided',
          message: 'Please provide an image file'
        });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        if (req.cleanup) await req.cleanup();
        return res.status(404).json({
          error: 'User not found',
          message: 'The requested user could not be found'
        });
      }

      // Update avatar URL
      user.profile.avatar = req.uploadedImage.url;
      await user.save();

      const userResponse = user.getPublicProfile();

      res.json({
        message: 'Avatar uploaded successfully',
        data: { 
          user: userResponse,
          avatarUrl: req.uploadedImage.url
        }
      });

    } catch (error) {
      console.error('Avatar upload error:', error);
      
      // Cleanup uploaded file on error
      if (req.cleanup) {
        await req.cleanup();
      }

      res.status(500).json({
        error: 'Avatar upload failed',
        message: 'An error occurred while uploading avatar'
      });
    }
  }
);

// @route   GET /api/users/:id/songs
// @desc    Get songs uploaded by a user
// @access  Public
router.get('/:id/songs', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['approved', 'pending', 'rejected'])
    .withMessage('Status must be approved, pending, or rejected')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'approved'
    } = req.query;

    // Build query
    const query = {
      uploadedBy: req.params.id,
      status,
      isActive: true
    };

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const songs = await Song.find(query)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Song.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      message: 'User songs retrieved successfully',
      data: {
        songs,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalSongs: total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('User songs retrieval error:', error);
    res.status(500).json({
      error: 'User songs retrieval failed',
      message: 'An error occurred while retrieving user songs'
    });
  }
});

// @route   GET /api/users/:id/stats
// @desc    Get user statistics
// @access  Private (Own profile or Admin)
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    // Check if user can view these stats
    if (req.params.id !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own statistics'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user could not be found'
      });
    }

    // Get detailed statistics
    const totalSongs = await Song.countDocuments({
      uploadedBy: user._id,
      isActive: true
    });

    const approvedSongs = await Song.countDocuments({
      uploadedBy: user._id,
      status: 'approved',
      isActive: true
    });

    const pendingSongs = await Song.countDocuments({
      uploadedBy: user._id,
      status: 'pending',
      isActive: true
    });

    const rejectedSongs = await Song.countDocuments({
      uploadedBy: user._id,
      status: 'rejected',
      isActive: true
    });

    // Get total play count for user's songs
    const playCountResult = await Song.aggregate([
      {
        $match: {
          uploadedBy: user._id,
          status: 'approved',
          isActive: true
        }
      },
      {
        $group: {
          _id: null,
          totalPlayCount: { $sum: '$stats.playCount' },
          totalFavoriteCount: { $sum: '$stats.favoriteCount' },
          averageRating: { $avg: '$stats.averageRating' }
        }
      }
    ]);

    const aggregateStats = playCountResult[0] || {
      totalPlayCount: 0,
      totalFavoriteCount: 0,
      averageRating: 0
    };

    const stats = {
      user: {
        songsPlayed: user.stats.songsPlayed,
        lastLogin: user.stats.lastLogin,
        memberSince: user.createdAt
      },
      uploads: {
        totalSongs,
        approvedSongs,
        pendingSongs,
        rejectedSongs
      },
      engagement: {
        totalPlayCount: aggregateStats.totalPlayCount,
        totalFavoriteCount: aggregateStats.totalFavoriteCount,
        averageRating: Math.round(aggregateStats.averageRating * 100) / 100
      }
    };

    res.json({
      message: 'User statistics retrieved successfully',
      data: { stats }
    });

  } catch (error) {
    console.error('User statistics retrieval error:', error);
    res.status(500).json({
      error: 'User statistics retrieval failed',
      message: 'An error occurred while retrieving user statistics'
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Update user status (activate/deactivate)
// @access  Private (Admin only)
router.put('/:id/status', authenticate, authorize('admin'), [
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user could not be found'
      });
    }

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user._id.toString() && !isActive) {
      return res.status(400).json({
        error: 'Cannot deactivate yourself',
        message: 'You cannot deactivate your own account'
      });
    }

    user.isActive = isActive;
    await user.save();

    const userResponse = user.getPublicProfile();

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user: userResponse }
    });

  } catch (error) {
    console.error('User status update error:', error);
    res.status(500).json({
      error: 'User status update failed',
      message: 'An error occurred while updating user status'
    });
  }
});

// @route   PUT /api/users/:id/role
// @desc    Update user role
// @access  Private (Admin only)
router.put('/:id/role', authenticate, authorize('admin'), [
  body('role')
    .isIn(['senior', 'contributor', 'admin'])
    .withMessage('Role must be senior, contributor, or admin')
], handleValidationErrors, async (req, res) => {
  try {
    const { role } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user could not be found'
      });
    }

    // Prevent admin from changing their own role (safety measure)
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Cannot change own role',
        message: 'You cannot change your own role'
      });
    }

    user.role = role;
    await user.save();

    const userResponse = user.getPublicProfile();

    res.json({
      message: 'User role updated successfully',
      data: { user: userResponse }
    });

  } catch (error) {
    console.error('User role update error:', error);
    res.status(500).json({
      error: 'User role update failed',
      message: 'An error occurred while updating user role'
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user account (mark as inactive)
// @access  Private (Own account or Admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Check if user can delete this account
    if (req.params.id !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own account'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user could not be found'
      });
    }

    // Prevent admin from deleting themselves
    if (req.params.id === req.user._id.toString() && req.user.role === 'admin') {
      return res.status(400).json({
        error: 'Cannot delete admin account',
        message: 'Admin accounts cannot be deleted'
      });
    }

    // Mark user as inactive instead of deleting
    user.isActive = false;
    await user.save();

    // Also mark user's songs as inactive
    await Song.updateMany(
      { uploadedBy: user._id },
      { isActive: false }
    );

    res.json({
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      error: 'Account deletion failed',
      message: 'An error occurred while deleting account'
    });
  }
});

module.exports = router;