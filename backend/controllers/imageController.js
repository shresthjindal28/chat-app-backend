const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'));
    }
  }
}).single('image');

// Analyze image using OpenAI Vision
const analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Read the image file
    const imageBuffer = await fs.readFile(req.file.path);
    
    // Convert image to base64
    const base64Image = imageBuffer.toString('base64');

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image? Please provide a detailed description." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${path.extname(req.file.originalname).slice(1)};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    // Clean up: delete the uploaded file
    await fs.unlink(req.file.path);

    // Suggest alt text for SEO
    res.json({ 
      description: response.choices[0].message.content,
      alt: 'AI-generated description for SEO and accessibility'
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: 'Error analyzing image' });
  }
};

// Generate image from text using DALL-E
const generateImage = async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'standard', style = 'natural' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: size,
      quality: quality,
      style: style
    });

    // Set cache headers for SEO/performance
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.json({ 
      imageUrl: response.data[0].url,
      alt: `AI generated image for: ${prompt}` // SEO alt text
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Error generating image' });
  }
};

// Optimize uploaded image
const optimizeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const optimizedImagePath = path.join('uploads', `optimized-${req.file.filename}`);

    await sharp(req.file.path)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(optimizedImagePath);

    // Clean up original file
    await fs.unlink(req.file.path);

    res.json({ 
      message: 'Image optimized successfully',
      optimizedImagePath: optimizedImagePath
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    res.status(500).json({ error: 'Error optimizing image' });
  }
};

module.exports = {
  upload,
  analyzeImage,
  generateImage,
  optimizeImage
};