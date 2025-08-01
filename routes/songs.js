const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Song = require('../models/Song');
const User = require('../models/User');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { uploadSongFiles, cleanupFiles } = require('../middleware/upload');

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

// Validation rules for song creation
const songValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('artist')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Artist name must be between 1 and 100 characters'),
  body('album')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Album name cannot exceed 100 characters'),
  body('genre')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Genre cannot exceed 50 characters'),
  body('year')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year must be between 1900 and next year'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 7200 })
    .withMessage('Duration must be between 1 and 7200 seconds'),
  body('lyrics')
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage('Lyrics cannot exceed 10000 characters'),
  body('language')
    .optional()
    .isIn(['en', 'zh', 'mixed', 'other'])
    .withMessage('Language must be en, zh, mixed, or other'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each tag must be between 1 and 30 characters')
];

// @route   GET /api/songs
// @desc    Get all approved songs with pagination and filtering
// @access  Public
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot exceed 100 characters'),
  query('genre')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Genre filter cannot exceed 50 characters'),
  query('language')
    .optional()
    .isIn(['en', 'zh', 'mixed', 'other'])
    .withMessage('Language filter must be en, zh, mixed, or other'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'playCount', 'favoriteCount', 'title', 'artist'])
    .withMessage('Sort by must be createdAt, playCount, favoriteCount, title, or artist'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
], handleValidationErrors, optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      genre,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { status: 'approved', isActive: true };

    // Add filters
    if (search) {
      query.$text = { $search: search };
    }
    if (genre) {
      query.genre = new RegExp(genre, 'i');
    }
    if (language) {
      query.language = language;
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'playCount') {
      sort['stats.playCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'favoriteCount') {
      sort['stats.favoriteCount'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const songs = await Song.find(query)
      .populate('uploadedBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Song.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      message: 'Songs retrieved successfully',
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
    console.error('Songs retrieval error:', error);
    res.status(500).json({
      error: 'Songs retrieval failed',
      message: 'An error occurred while retrieving songs'
    });
  }
});

// @route   GET /api/songs/featured
// @desc    Get featured songs
// @access  Public
router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const songs = await Song.find({
      status: 'approved',
      isActive: true,
      isFeatured: true
    })
    .populate('uploadedBy', 'name')
    .sort({ featuredAt: -1 })
    .limit(10)
    .lean();

    res.json({
      message: 'Featured songs retrieved successfully',
      data: { songs }
    });

  } catch (error) {
    console.error('Featured songs retrieval error:', error);
    res.status(500).json({
      error: 'Featured songs retrieval failed',
      message: 'An error occurred while retrieving featured songs'
    });
  }
});

// @route   GET /api/songs/popular
// @desc    Get popular songs
// @access  Public
router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const songs = await Song.findPopular(10);
    await Song.populate(songs, { path: 'uploadedBy', select: 'name' });

    res.json({
      message: 'Popular songs retrieved successfully',
      data: { songs }
    });

  } catch (error) {
    console.error('Popular songs retrieval error:', error);
    res.status(500).json({
      error: 'Popular songs retrieval failed',
      message: 'An error occurred while retrieving popular songs'
    });
  }
});

// @route   GET /api/songs/recent
// @desc    Get recent songs
// @access  Public
router.get('/recent', optionalAuth, async (req, res) => {
  try {
    const songs = await Song.findRecent(10);
    await Song.populate(songs, { path: 'uploadedBy', select: 'name' });

    res.json({
      message: 'Recent songs retrieved successfully',
      data: { songs }
    });

  } catch (error) {
    console.error('Recent songs retrieval error:', error);
    res.status(500).json({
      error: 'Recent songs retrieval failed',
      message: 'An error occurred while retrieving recent songs'
    });
  }
});

// @route   GET /api/songs/:id
// @desc    Get single song by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const song = await Song.findOne({
      _id: req.params.id,
      status: 'approved',
      isActive: true
    }).populate('uploadedBy', 'name');

    if (!song) {
      return res.status(404).json({
        error: 'Song not found',
        message: 'The requested song could not be found'
      });
    }

    res.json({
      message: 'Song retrieved successfully',
      data: { song }
    });

  } catch (error) {
    console.error('Song retrieval error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid song ID',
        message: 'The provided song ID is not valid'
      });
    }
    res.status(500).json({
      error: 'Song retrieval failed',
      message: 'An error occurred while retrieving the song'
    });
  }
});

// @route   POST /api/songs
// @desc    Upload a new song
// @access  Private (Contributors and Admins)
router.post('/', 
  authenticate, 
  authorize('contributor', 'admin'),
  uploadSongFiles,
  cleanupFiles,
  songValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        title,
        artist,
        album,
        genre,
        year,
        duration,
        lyrics,
        language,
        tags
      } = req.body;

      // Create song object
      const songData = {
        title,
        artist,
        album: album || '',
        genre: genre || '',
        year: year ? parseInt(year) : undefined,
        duration: duration ? parseInt(duration) : undefined,
        lyrics: lyrics || '',
        language: language || 'en',
        tags: tags || [],
        uploadedBy: req.user._id,
        audioFile: {
          filename: req.audioFile.filename,
          originalName: req.audioFile.originalname,
          mimeType: req.audioFile.mimetype,
          size: req.audioFile.size,
          url: req.audioFile.url
        }
      };

      // Add cover image if provided
      if (req.coverImage) {
        songData.coverImage = {
          filename: req.coverImage.filename,
          originalName: req.coverImage.originalname,
          mimeType: req.coverImage.mimetype,
          size: req.coverImage.size,
          url: req.coverImage.url
        };
      }

      // Auto-approve for admins, pending for contributors
      if (req.user.role === 'admin') {
        songData.status = 'approved';
        songData.moderatedBy = req.user._id;
        songData.moderatedAt = new Date();
      }

      const song = new Song(songData);
      await song.save();

      // Populate uploader information
      await song.populate('uploadedBy', 'name');

      res.status(201).json({
        message: 'Song uploaded successfully',
        data: { song }
      });

    } catch (error) {
      console.error('Song upload error:', error);
      
      // Cleanup uploaded files on error
      if (req.cleanup) {
        await req.cleanup();
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Please check your song data',
          details: Object.values(error.errors).map(err => err.message)
        });
      }

      res.status(500).json({
        error: 'Song upload failed',
        message: 'An error occurred while uploading the song'
      });
    }
  }
);

// @route   PUT /api/songs/:id/play
// @desc    Increment play count for a song
// @access  Public
router.put('/:id/play', optionalAuth, async (req, res) => {
  try {
    const song = await Song.findOne({
      _id: req.params.id,
      status: 'approved',
      isActive: true
    });

    if (!song) {
      return res.status(404).json({
        error: 'Song not found',
        message: 'The requested song could not be found'
      });
    }

    await song.incrementPlayCount();

    // Update user stats if authenticated
    if (req.user) {
      await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { 'stats.songsPlayed': 1 } }
      );
    }

    res.json({
      message: 'Play count updated successfully',
      data: {
        playCount: song.stats.playCount
      }
    });

  } catch (error) {
    console.error('Play count update error:', error);
    res.status(500).json({
      error: 'Play count update failed',
      message: 'An error occurred while updating play count'
    });
  }
});

// @route   POST /api/songs/:id/rate
// @desc    Rate a song
// @access  Private
router.post('/:id/rate', authenticate, [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5')
], handleValidationErrors, async (req, res) => {
  try {
    const { rating } = req.body;

    const song = await Song.findOne({
      _id: req.params.id,
      status: 'approved',
      isActive: true
    });

    if (!song) {
      return res.status(404).json({
        error: 'Song not found',
        message: 'The requested song could not be found'
      });
    }

    await song.addRating(rating);

    res.json({
      message: 'Song rated successfully',
      data: {
        averageRating: song.stats.averageRating,
        ratingCount: song.stats.ratingCount
      }
    });

  } catch (error) {
    console.error('Song rating error:', error);
    res.status(500).json({
      error: 'Song rating failed',
      message: 'An error occurred while rating the song'
    });
  }
});

// @route   GET /api/songs/user/:userId
// @desc    Get songs uploaded by a specific user
// @access  Public
router.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const songs = await Song.find({
      uploadedBy: req.params.userId,
      status: 'approved',
      isActive: true
    })
    .populate('uploadedBy', 'name')
    .sort({ createdAt: -1 });

    res.json({
      message: 'User songs retrieved successfully',
      data: { songs }
    });

  } catch (error) {
    console.error('User songs retrieval error:', error);
    res.status(500).json({
      error: 'User songs retrieval failed',
      message: 'An error occurred while retrieving user songs'
    });
  }
});

// @route   DELETE /api/songs/:id
// @desc    Delete a song (mark as inactive)
// @access  Private (Owner or Admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        error: 'Song not found',
        message: 'The requested song could not be found'
      });
    }

    // Check if user owns the song or is admin
    if (song.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own songs'
      });
    }

    // Mark as inactive instead of deleting
    song.isActive = false;
    await song.save();

    res.json({
      message: 'Song deleted successfully'
    });

  } catch (error) {
    console.error('Song deletion error:', error);
    res.status(500).json({
      error: 'Song deletion failed',
      message: 'An error occurred while deleting the song'
    });
  }
});

module.exports = router;