import User from '../models/User.js'
import Notification from '../models/Notification.js'
import bcrypt from 'bcryptjs'
import { v2 as cloudinary } from 'cloudinary'

export const getMe = (req, res) => {
  const { password, ...user } = req.user.toObject()
  res.json(user)
}

export const updateMe = async (req, res) => {
  try {
    Object.assign(req.user, req.body)
    await req.user.save()
    res.json({ message: 'Profile updated' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!(await req.user.comparePassword(oldPassword)))
      return res.status(400).json({ error: 'Wrong password' })
    req.user.password = newPassword
    await req.user.save()
    res.json({ message: 'Password updated' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const uploadProfileImage = async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path)
    req.user.profileImage = result.secure_url
    await req.user.save()
    res.json({ url: result.secure_url })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

// Get notification settings
export const getNotificationSettings = async (req, res) => {
  try {
    // Default settings if none exist
    const defaultSettings = {
      messages: true,
      email: false,
      desktop: true,
      soundEnabled: true,
      messagePreview: true,
      showSender: true
    };

    // If user has settings, return those, otherwise return defaults
    const settings = req.user.notificationSettings || defaultSettings;
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update notification settings
export const updateNotificationSettings = async (req, res) => {
  try {
    // Create settings object if it doesn't exist
    if (!req.user.notificationSettings) {
      req.user.notificationSettings = {};
    }

    // Update only the provided settings
    Object.keys(req.body).forEach(key => {
      req.user.notificationSettings[key] = req.body[key];
    });

    await req.user.save();
    res.json(req.user.notificationSettings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get friends
export const getFriends = async (req, res) => {
  try {
    // Populate friends with username and profileImage
    await req.user.populate('friends', 'username profileImage');
    res.json(req.user.friends || []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Remove friend
export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.body;
    req.user.friends = (req.user.friends || []).filter(id => id.toString() !== friendId);
    await req.user.save();
    // Remove this user from the other user's friends as well
    const other = await User.findById(friendId);
    if (other) {
      other.friends = (other.friends || []).filter(id => id.toString() !== req.user._id.toString());
      await other.save();
    }
    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get user notifications
export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Mark all notifications as read
export const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Handle notification actions (accept/decline friend requests)
export const handleNotificationAction = async (req, res) => {
  try {
    const { notificationId, action } = req.body;
    
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to act on this notification' });
    }
    
    // Mark notification as read
    notification.read = true;
    await notification.save();
    
    // Handle different notification types
    if (notification.type === 'friendRequest') {
      const sender = await User.findById(notification.sender);
      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' });
      }
      
      if (action === 'accept') {
        // Add users to each other's friends list
        if (!req.user.friends) req.user.friends = [];
        if (!sender.friends) sender.friends = [];
        
        if (!req.user.friends.includes(sender._id)) {
          req.user.friends.push(sender._id);
        }
        
        if (!sender.friends.includes(req.user._id)) {
          sender.friends.push(req.user._id);
        }
        
        // Remove from requests lists
        req.user.receivedRequests = (req.user.receivedRequests || [])
          .filter(id => id.toString() !== sender._id.toString());
        sender.sentRequests = (sender.sentRequests || [])
          .filter(id => id.toString() !== req.user._id.toString());
          
        await req.user.save();
        await sender.save();
        
        // Create acceptance notification for the original sender
        await Notification.create({
          recipient: sender._id,
          sender: req.user._id,
          type: 'friendAccepted',
          senderName: req.user.username
        });
        
        return res.json({ message: 'Friend request accepted' });
      } 
      else if (action === 'decline') {
        // Just remove from requests lists
        req.user.receivedRequests = (req.user.receivedRequests || [])
          .filter(id => id.toString() !== sender._id.toString());
        sender.sentRequests = (sender.sentRequests || [])
          .filter(id => id.toString() !== req.user._id.toString());
          
        await req.user.save();
        await sender.save();
        
        return res.json({ message: 'Friend request declined' });
      }
    }
    
    return res.status(400).json({ error: 'Invalid action or notification type' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Send friend request - robust and correct
export const sendFriendRequest = async (req, res) => {
  try {
    // Accept either userId or toUserId for flexibility
    const toUserId = (req.body.toUserId || req.body.userId || '').toString();
    const myUserId = req.user._id.toString();

    if (!toUserId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    if (toUserId === myUserId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    // Find recipient
    const toUser = await User.findById(toUserId);
    if (!toUser) return res.status(404).json({ error: 'User not found' });

    // Ensure arrays exist and are strings
    req.user.friends = (req.user.friends || []).map(id => id.toString());
    req.user.sentRequests = (req.user.sentRequests || []).map(id => id.toString());
    toUser.friends = (toUser.friends || []).map(id => id.toString());
    toUser.receivedRequests = (toUser.receivedRequests || []).map(id => id.toString());

    // Already friends?
    if (req.user.friends.includes(toUserId) || toUser.friends.includes(myUserId)) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    // Already sent?
    if (req.user.sentRequests.includes(toUserId) || toUser.receivedRequests.includes(myUserId)) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Already received from them? (cross-request)
    if (req.user.receivedRequests.includes(toUserId) || toUser.sentRequests?.includes(myUserId)) {
      return res.status(400).json({ error: 'This user already sent you a friend request' });
    }

    // Add to requests
    req.user.sentRequests.push(toUserId);
    toUser.receivedRequests.push(myUserId);

    await req.user.save();
    await toUser.save();

    // Create notification for recipient
    await Notification.create({
      recipient: toUserId,
      sender: req.user._id,
      type: 'friendRequest',
      senderName: req.user.username
    });

    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Accept friend request
export const acceptFriendRequest = async (req, res) => {
  try {
    const { fromUserId } = req.body;
    // Add each other as friends
    if (!req.user.friends) req.user.friends = [];
    if (!req.user.friends.includes(fromUserId)) req.user.friends.push(fromUserId);
    const fromUser = await User.findById(fromUserId);
    if (fromUser && (!fromUser.friends || !fromUser.friends.includes(req.user._id.toString()))) {
      if (!fromUser.friends) fromUser.friends = [];
      fromUser.friends.push(req.user._id.toString());
      await fromUser.save();
    }
    // Remove from requests
    req.user.receivedRequests = (req.user.receivedRequests || []).filter(id => id !== fromUserId);
    await req.user.save();
    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
