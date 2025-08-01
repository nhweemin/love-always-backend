const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in query results by default
  },
  role: {
    type: String,
    enum: ['senior', 'contributor', 'admin'],
    default: 'senior'
  },
  preferences: {
    language: {
      type: String,
      enum: ['en', 'zh'],
      default: 'en'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    highContrast: {
      type: Boolean,
      default: false
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  profile: {
    avatar: {
      type: String,
      default: null
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: ''
    },
    birthYear: {
      type: Number,
      min: [1900, 'Birth year must be after 1900'],
      max: [new Date().getFullYear(), 'Birth year cannot be in the future']
    }
  },
  stats: {
    songsUploaded: {
      type: Number,
      default: 0
    },
    songsPlayed: {
      type: Number,
      default: 0
    },
    lastLogin: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerificationToken: String,
  emailVerificationExpire: Date
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Index for better query performance (email index is auto-created by unique: true)
userSchema.index({ role: 1 });
userSchema.index({ 'stats.lastLogin': -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Get user profile without sensitive data
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpire;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpire;
  return userObject;
};

// Static method to find active users
userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

// Update last login
userSchema.methods.updateLastLogin = async function() {
  this.stats.lastLogin = new Date();
  return await this.save();
};

// Virtual for user age (if birth year is provided)
userSchema.virtual('age').get(function() {
  if (!this.profile.birthYear) return null;
  return new Date().getFullYear() - this.profile.birthYear;
});

// Ensure virtual fields are included in JSON output
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);