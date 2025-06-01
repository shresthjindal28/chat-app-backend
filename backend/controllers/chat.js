import User from '../models/User.js'
import Message from '../models/Message.js'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

export const getPeers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }, 'username profileImage')
    res.json(users)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const getHistory = async (req, res) => {
  try {
    const { peerId } = req.params
    const messages = await Message.find({
      $or: [
        { from: req.user._id, to: peerId },
        { from: peerId, to: req.user._id }
      ]
    }).sort('createdAt')
    res.json(messages)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const sendMessage = async (req, res) => {
  try {
    const { to, content, type = 'text' } = req.body
    const msg = await Message.create({ 
      from: req.user._id, 
      to, 
      content,
      type
    })
    res.json(msg)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const getUnreadCounts = async (req, res) => {
  try {
    // Find all messages sent to the user that are unread, grouped by sender
    const unread = await Message.aggregate([
      { $match: { to: req.user._id, read: { $ne: true } } },
      { $group: { _id: "$from", count: { $sum: 1 } } }
    ]);
    // Convert to { peerId: count }
    const result = {};
    unread.forEach(u => { result[u._id] = u.count; });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export const markRead = async (req, res) => {
  try {
    const { peerId } = req.params;
    await Message.updateMany(
      { from: peerId, to: req.user._id, read: { $ne: true } },
      { $set: { read: true } }
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Send image message
export const sendImageMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const { to } = req.body;
    
    // Upload to cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);
    
    // Delete local file after upload
    fs.unlinkSync(req.file.path);
    
    // Create message
    const msg = await Message.create({
      from: req.user._id,
      to,
      content: result.secure_url,
      type: 'image'
    });
    
    // Emit via socket to both sender and receiver
    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('chat:message', msg);
      io.to(to).emit('chat:message', msg);
    }
    
    // Return the message object in response
    res.json({ message: msg });
    
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Send voice message
export const sendVoiceMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const { to } = req.body;
    
    // Upload to cloudinary as audio
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video', // Cloudinary uses 'video' type for audio files
      folder: 'voice-messages'
    });
    
    // Delete local file after upload
    fs.unlinkSync(req.file.path);
    
    // Create message
    const msg = await Message.create({
      from: req.user._id,
      to,
      content: result.secure_url,
      type: 'voice'
    });
    
    // Emit via socket to both sender and receiver
    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('chat:message', msg);
      io.to(to).emit('chat:message', msg);
    }
    
    // Return the message object in response
    res.json({ message: msg });
    
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Send location message
export const sendLocationMessage = async (req, res) => {
  try {
    const { to, latitude, longitude } = req.body;
    
    // Create message
    const msg = await Message.create({
      from: req.user._id,
      to,
      content: `https://www.google.com/maps?q=${latitude},${longitude}`,
      type: 'location'
    });
    
    res.json(msg);
    
    // Emit via socket if needed
    req.app.get('io')?.to(to).emit('chat:message', msg);
    
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
