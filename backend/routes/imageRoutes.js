const express = require('express');
const router = express.Router();
const { upload, analyzeImage, generateImage, optimizeImage } = require('../controllers/imageController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Route for analyzing images using OpenAI Vision
router.post('/analyze', upload, analyzeImage);

// Route for generating images using DALL-E
router.post('/generate', generateImage);

// Route for optimizing uploaded images
router.post('/optimize', upload, optimizeImage);

module.exports = router; 