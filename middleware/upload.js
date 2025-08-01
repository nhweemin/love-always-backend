const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Create uploads directory if it doesn't exist
const createUploadDirs = async () => {
  const dirs = ['uploads', 'uploads/audio', 'uploads/images', 'uploads/temp'];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
    }
  }
};

// Initialize upload directories
createUploadDirs();

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/temp';
    
    if (file.fieldname === 'audio') {
      uploadPath = 'uploads/audio';
    } else if (file.fieldname === 'coverImage') {
      uploadPath = 'uploads/images';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9]/g, '-') // Replace special chars with hyphens
      .substring(0, 50); // Limit length
    
    cb(null, `${baseName}-${uniqueSuffix}${extension}`);
  }
});

// File filter for audio files
const audioFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/mpeg',      // MP3
    'audio/mp3',       // MP3 (alternative)
    'audio/wav',       // WAV
    'audio/wave',      // WAV (alternative)
    'audio/x-wav',     // WAV (alternative)
    'audio/aac',       // AAC
    'audio/ogg',       // OGG
    'audio/webm',      // WebM audio
    'audio/mp4',       // MP4 audio
    'audio/m4a',       // M4A
    'audio/x-m4a',     // M4A (alternative)
    'audio/flac',      // FLAC
  ];

  const allowedExtensions = ['.mp3', '.wav', '.aac', '.ogg', '.webm', '.mp4', '.m4a', '.flac'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid audio format. Allowed formats: ${allowedExtensions.join(', ')}`), false);
  }
};

// File filter for image files
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid image format. Allowed formats: ${allowedExtensions.join(', ')}`), false);
  }
};

// Combined file filter
const combinedFileFilter = (req, file, cb) => {
  if (file.fieldname === 'audio') {
    audioFileFilter(req, file, cb);
  } else if (file.fieldname === 'coverImage') {
    imageFileFilter(req, file, cb);
  } else {
    cb(new Error('Invalid field name'), false);
  }
};

// Multer configuration for song uploads
const songUpload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for audio files
    files: 2, // Max 2 files (audio + cover image)
  },
  fileFilter: combinedFileFilter
});

// Multer configuration for profile images
const profileImageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for profile images
    files: 1
  },
  fileFilter: imageFileFilter
});

// Middleware to handle song upload (audio + optional cover image)
const uploadSongFiles = (req, res, next) => {
  const upload = songUpload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]);

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      let message = 'File upload error';
      
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          message = 'File too large. Audio files must be under 100MB, images under 5MB';
          break;
        case 'LIMIT_FILE_COUNT':
          message = 'Too many files. Maximum 1 audio file and 1 cover image allowed';
          break;
        case 'LIMIT_FIELD_COUNT':
          message = 'Too many fields in request';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Unexpected file field. Only "audio" and "coverImage" fields are allowed';
          break;
        default:
          message = `Upload error: ${err.message}`;
      }
      
      return res.status(400).json({
        error: 'File upload failed',
        message: message
      });
    } else if (err) {
      return res.status(400).json({
        error: 'File upload failed',
        message: err.message
      });
    }

    // Check if audio file was provided
    if (!req.files || !req.files.audio || req.files.audio.length === 0) {
      return res.status(400).json({
        error: 'Audio file required',
        message: 'Please provide an audio file'
      });
    }

    // Add file URLs to request
    if (req.files.audio) {
      req.audioFile = {
        ...req.files.audio[0],
        url: `/uploads/audio/${req.files.audio[0].filename}`
      };
    }

    if (req.files.coverImage) {
      req.coverImage = {
        ...req.files.coverImage[0],
        url: `/uploads/images/${req.files.coverImage[0].filename}`
      };
    }

    next();
  });
};

// Middleware to handle profile image upload
const uploadProfileImage = (req, res, next) => {
  const upload = profileImageUpload.single('avatar');

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      let message = 'Image upload error';
      
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          message = 'Image too large. Maximum size is 5MB';
          break;
        default:
          message = `Upload error: ${err.message}`;
      }
      
      return res.status(400).json({
        error: 'Image upload failed',
        message: message
      });
    } else if (err) {
      return res.status(400).json({
        error: 'Image upload failed',
        message: err.message
      });
    }

    if (req.file) {
      req.uploadedImage = {
        ...req.file,
        url: `/uploads/images/${req.file.filename}`
      };
    }

    next();
  });
};

// Utility function to delete file
const deleteFile = async (filepath) => {
  try {
    await fs.unlink(filepath);
    console.log(`Deleted file: ${filepath}`);
  } catch (error) {
    console.error(`Error deleting file ${filepath}:`, error);
  }
};

// Cleanup middleware for failed uploads
const cleanupFiles = (req, res, next) => {
  const cleanup = async () => {
    if (req.files) {
      if (req.files.audio) {
        await deleteFile(req.files.audio[0].path);
      }
      if (req.files.coverImage) {
        await deleteFile(req.files.coverImage[0].path);
      }
    }
    if (req.file) {
      await deleteFile(req.file.path);
    }
  };

  // Store cleanup function for later use
  req.cleanup = cleanup;
  next();
};

module.exports = {
  uploadSongFiles,
  uploadProfileImage,
  cleanupFiles,
  deleteFile
};