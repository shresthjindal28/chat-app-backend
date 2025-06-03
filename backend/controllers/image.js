import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

export const uploadImage = async (req, res) => {
  try {
    // Debug: log file info
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Validate file type (JPEG, PNG, GIF, WebP)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Clean up local file if it exists
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Only JPEG, PNG, GIF, and WebP images are allowed' });
    }

    // Validate file size (should be <= 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Image size must be less than 5MB' });
    }

    const result = await cloudinary.uploader.upload(req.file.path);
    
    // Delete local file after upload
    fs.unlinkSync(req.file.path);
    
    req.user.gallery.push(result.secure_url);
    await req.user.save();
    
    res.json({ url: result.secure_url });
  } catch (err) {
    // Clean up local file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Image upload error:', err);
    res.status(400).json({ error: err.message || 'Failed to upload image' });
  }
}

export const getImages = (req, res) => {
  try {
    res.json(req.user.gallery || []);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to fetch images' });
  }
}

export const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    // Find the image URL in the user's gallery that contains the id
    const imageUrl = req.user.gallery.find(url => url.includes(id));
    
    if (!imageUrl) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Extract Cloudinary public_id from the URL
    // Cloudinary URLs are like: https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
    // We need to get the part after '/upload/' and before the extension
    let publicId = imageUrl.split('/upload/')[1];
    if (publicId) {
      publicId = publicId.split('.')[0]; // Remove extension
    } else {
      // fallback: use last segment without extension
      publicId = imageUrl.split('/').slice(-1)[0].split('.')[0];
    }
    
    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);
    
    // Remove from user's gallery
    req.user.gallery = req.user.gallery.filter(url => url !== imageUrl);
    await req.user.save();
    
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to delete image' });
  }
}
