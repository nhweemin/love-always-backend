const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Song title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  artist: {
    type: String,
    required: [true, 'Artist name is required'],
    trim: true,
    maxlength: [100, 'Artist name cannot exceed 100 characters']
  },
  album: {
    type: String,
    trim: true,
    maxlength: [100, 'Album name cannot exceed 100 characters'],
    default: ''
  },
  genre: {
    type: String,
    trim: true,
    maxlength: [50, 'Genre cannot exceed 50 characters'],
    default: ''
  },
  year: {
    type: Number,
    min: [1900, 'Year must be after 1900'],
    max: [new Date().getFullYear() + 1, 'Year cannot be in the future']
  },
  duration: {
    type: Number, // Duration in seconds
    min: [1, 'Duration must be at least 1 second'],
    max: [7200, 'Duration cannot exceed 2 hours'] // 2 hours max
  },
  lyrics: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    enum: ['en', 'zh', 'mixed', 'other'],
    default: 'en'
  },
  
  // File information
  audioFile: {
    filename: {
      type: String,
      required: [true, 'Audio filename is required']
    },
    originalName: {
      type: String,
      required: [true, 'Original filename is required']
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required']
    },
    size: {
      type: Number,
      required: [true, 'File size is required'],
      max: [100 * 1024 * 1024, 'File size cannot exceed 100MB'] // 100MB max
    },
    url: {
      type: String,
      required: [true, 'Audio URL is required']
    }
  },
  
  coverImage: {
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String
  },
  
  // Metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader information is required']
  },
  
  // Moderation and approval
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'hidden'],
    default: 'pending'
  },
  moderationNotes: {
    type: String,
    default: ''
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date,
  
  // Analytics and engagement
  stats: {
    playCount: {
      type: Number,
      default: 0
    },
    favoriteCount: {
      type: Number,
      default: 0
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastPlayed: Date,
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    ratingCount: {
      type: Number,
      default: 0
    }
  },
  
  // Accessibility features
  accessibility: {
    hasLargeText: {
      type: Boolean,
      default: false
    },
    hasHighContrast: {
      type: Boolean,
      default: false
    },
    transcriptionAvailable: {
      type: Boolean,
      default: false
    }
  },
  
  // Tags for better organization
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  // Playlist associations
  playlists: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist'
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Featured status for highlighting popular content
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredAt: Date,
  
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for better performance
songSchema.index({ title: 'text', artist: 'text', album: 'text' }); // Text search
songSchema.index({ status: 1, isActive: 1 });
songSchema.index({ uploadedBy: 1 });
songSchema.index({ 'stats.playCount': -1 });
songSchema.index({ 'stats.favoriteCount': -1 });
songSchema.index({ createdAt: -1 });
songSchema.index({ genre: 1 });
songSchema.index({ language: 1 });
songSchema.index({ isFeatured: 1, featuredAt: -1 });

// Virtual for formatted duration
songSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return '0:00';
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for file size in human readable format
songSchema.virtual('formattedFileSize').get(function() {
  if (!this.audioFile.size) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(this.audioFile.size) / Math.log(1024));
  return `${(this.audioFile.size / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
});

// Static method to find approved songs
songSchema.statics.findApproved = function() {
  return this.find({ status: 'approved', isActive: true });
};

// Static method to find popular songs
songSchema.statics.findPopular = function(limit = 10) {
  return this.find({ status: 'approved', isActive: true })
    .sort({ 'stats.playCount': -1, 'stats.favoriteCount': -1 })
    .limit(limit);
};

// Static method to find recent songs
songSchema.statics.findRecent = function(limit = 10) {
  return this.find({ status: 'approved', isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Method to increment play count
songSchema.methods.incrementPlayCount = async function() {
  this.stats.playCount += 1;
  this.stats.lastPlayed = new Date();
  return await this.save();
};

// Method to add rating
songSchema.methods.addRating = async function(rating) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  
  const totalRating = this.stats.averageRating * this.stats.ratingCount;
  this.stats.ratingCount += 1;
  this.stats.averageRating = (totalRating + rating) / this.stats.ratingCount;
  
  return await this.save();
};

// Method to approve song
songSchema.methods.approve = async function(moderatorId, notes = '') {
  this.status = 'approved';
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  return await this.save();
};

// Method to reject song
songSchema.methods.reject = async function(moderatorId, notes = '') {
  this.status = 'rejected';
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  return await this.save();
};

// Pre-save middleware to update uploadedBy user stats
songSchema.pre('save', async function(next) {
  if (this.isNew && this.uploadedBy) {
    try {
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(
        this.uploadedBy,
        { $inc: { 'stats.songsUploaded': 1 } }
      );
    } catch (error) {
      console.error('Error updating user stats:', error);
    }
  }
  next();
});

// Ensure virtual fields are included in JSON output
songSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Song', songSchema);