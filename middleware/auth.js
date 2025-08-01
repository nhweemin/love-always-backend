const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No valid token provided. Please include Bearer token in Authorization header.'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token is required'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
      
      // Find user and exclude password
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          error: 'Account deactivated',
          message: 'Your account has been deactivated. Please contact support.'
        });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Your session has expired. Please login again.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid.'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
};

// Middleware to check if user has specific role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`
      });
    }

    next();
  };
};

// Middleware for optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      } else {
        req.user = null;
      }
    } catch (jwtError) {
      // Invalid token, but continue without user
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

// Middleware to check if user owns the resource or is admin
const requireOwnershipOrAdmin = (resourceUserIdPath = 'uploadedBy') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be logged in to access this resource'
        });
      }

      // Admins can access anything
      if (req.user.role === 'admin') {
        return next();
      }

      // For other operations, check ownership based on the resource
      const resourceId = req.params.id;
      
      if (!resourceId) {
        return res.status(400).json({
          error: 'Resource ID required',
          message: 'Resource ID must be provided'
        });
      }

      // This will be implemented per route as needed
      // For now, just check if user ID matches
      if (req.user._id.toString() === resourceId) {
        return next();
      }

      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources'
      });
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        error: 'Authorization failed',
        message: 'An error occurred during authorization'
      });
    }
  };
};

// Middleware to rate limit sensitive operations
const sensitiveOperationLimit = (req, res, next) => {
  // This would typically integrate with express-rate-limit
  // For now, just pass through
  next();
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  requireOwnershipOrAdmin,
  sensitiveOperationLimit
};