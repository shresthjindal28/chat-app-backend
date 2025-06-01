import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
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
    const imageUrl = req.user.gallery.find(url => url.includes(id));
    
    if (!imageUrl) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Extract public_id from Cloudinary URL
    const publicId = imageUrl.split('/').slice(-1)[0].split('.')[0];
    
    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);
    
    // Remove from user's gallery
    req.user.gallery = req.user.gallery.filter(url => !url.includes(id));
    await req.user.save();
    
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to delete image' });
  }
}
