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
      .populate('sender', 'username profileImage') // Populate sender details
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
    const toUserId = (req.body.toUserId || req.body.userId || '').toString();
    const myUserId = req.user._id.toString();

    if (!toUserId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    if (toUserId === myUserId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    const toUser = await User.findById(toUserId);
    if (!toUser) return res.status(404).json({ error: 'User not found' });

    // Initialize arrays if they don't exist
    if (!req.user.friends) req.user.friends = [];
    if (!req.user.sentRequests) req.user.sentRequests = [];
    if (!toUser.friends) toUser.friends = [];
    if (!toUser.receivedRequests) toUser.receivedRequests = [];
    if (!toUser.sentRequests) toUser.sentRequests = [];

    // Convert to strings for comparison
    const userFriends = req.user.friends.map(id => id.toString());
    const userSentRequests = req.user.sentRequests.map(id => id.toString());
    const toUserFriends = toUser.friends.map(id => id.toString());
    const toUserReceivedRequests = toUser.receivedRequests.map(id => id.toString());
    const toUserSentRequests = toUser.sentRequests.map(id => id.toString());

    // Check various conditions
    if (userFriends.includes(toUserId) || toUserFriends.includes(myUserId)) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }
    
    if (userSentRequests.includes(toUserId) || toUserReceivedRequests.includes(myUserId)) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }
    
    if (req.user.receivedRequests && req.user.receivedRequests.map(id => id.toString()).includes(toUserId)) {
      return res.status(400).json({ error: 'This user already sent you a friend request. Check your notifications.' });
    }

    // Add to request arrays
    req.user.sentRequests.push(toUserId);
    toUser.receivedRequests.push(myUserId);

    await Promise.all([req.user.save(), toUser.save()]);

    // Create notification for recipient
    await Notification.create({
      recipient: toUserId,
      sender: req.user._id,
      type: 'friendRequest',
      senderName: req.user.username
    });

    // Real-time: emit to recipient if socket.io is available
    const io = req.app && req.app.get && req.app.get('io');
    if (io) {
      io.to(toUserId).emit('friend:request', { 
        from: myUserId,
        fromUser: {
          _id: req.user._id,
          username: req.user.username,
          profileImage: req.user.profileImage
        }
      });
    }

    res.json({ 
      message: 'Friend request sent successfully',
      sentTo: {
        _id: toUser._id,
        username: toUser.username
      }
    });
  } catch (err) {
    console.error('Error sending friend request:', err);
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

// Block user
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    // Add to blockedUsers array (create if not exists)
    if (!req.user.blockedUsers) req.user.blockedUsers = [];
    if (!req.user.blockedUsers.includes(userId)) {
      req.user.blockedUsers.push(userId);
      await req.user.save();
    }
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Report user
export const reportUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    // Optionally, store reports in a collection or send an email/notification to admin
    // For now, just acknowledge
    res.json({ message: 'User reported' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Accept friend request from notification
export const acceptFriendRequestFromNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // Find the notification
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ error: 'Friend request notification not found' });
    }
    
    // Verify this notification is a friend request for the current user
    if (notification.type !== 'friendRequest' || 
        notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(400).json({ error: 'Invalid friend request notification' });
    }
    
    // Find the sender (the user who sent the friend request)
    const sender = await User.findById(notification.sender);
    if (!sender) {
      return res.status(404).json({ error: 'User who sent the request not found' });
    }
    
    // Initialize arrays if they don't exist
    if (!req.user.friends) req.user.friends = [];
    if (!sender.friends) sender.friends = [];
    
    // Add to friends lists if not already there
    if (!req.user.friends.some(id => id.toString() === sender._id.toString())) {
      req.user.friends.push(sender._id);
    }
    
    if (!sender.friends.some(id => id.toString() === req.user._id.toString())) {
      sender.friends.push(req.user._id);
    }
    
    // Remove from requests lists
    req.user.receivedRequests = (req.user.receivedRequests || [])
      .filter(id => id.toString() !== sender._id.toString());
    sender.sentRequests = (sender.sentRequests || [])
      .filter(id => id.toString() !== req.user._id.toString());
    
    // Mark notification as read and save
    notification.read = true;
    await notification.save();
    
    // Save both users
    await Promise.all([req.user.save(), sender.save()]);
    
    // Create acceptance notification for the original sender
    await Notification.create({
      recipient: sender._id,
      sender: req.user._id,
      type: 'friendAccepted',
      senderName: req.user.username
    });
    
    // Emit socket events for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Notify both users about the new friendship
      io.to(sender._id.toString()).emit('friend:update', { 
        type: 'accepted', 
        friend: {
          _id: req.user._id,
          username: req.user.username,
          profileImage: req.user.profileImage
        }
      });
      
      io.to(req.user._id.toString()).emit('friend:update', { 
        type: 'added', 
        friend: {
          _id: sender._id,
          username: sender.username,
          profileImage: sender.profileImage
        }
      });

      // Notify sender about acceptance
      io.to(sender._id.toString()).emit('notification:new', {
        type: 'friendAccepted',
        from: req.user.username
      });
    }
    
    res.json({ 
      message: 'Friend request accepted',
      friend: {
        _id: sender._id,
        username: sender.username,
        profileImage: sender.profileImage
      }
    });
  } catch (err) {
    console.error('Error accepting friend request:', err);
    res.status(400).json({ error: err.message });
  }
};

// Decline friend request from notification
export const declineFriendRequestFromNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // Find the notification
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ error: 'Friend request notification not found' });
    }
    
    // Verify this notification is a friend request for the current user
    if (notification.type !== 'friendRequest' || 
        notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(400).json({ error: 'Invalid friend request notification' });
    }
    
    // Find the sender (the user who sent the friend request)
    const sender = await User.findById(notification.sender);
    if (!sender) {
      return res.status(404).json({ error: 'User who sent the request not found' });
    }
    
    // Remove from requests lists
    req.user.receivedRequests = (req.user.receivedRequests || [])
      .filter(id => id.toString() !== sender._id.toString());
    
    if (sender) {
      sender.sentRequests = (sender.sentRequests || [])
        .filter(id => id.toString() !== req.user._id.toString());
      await sender.save();
    }
    
    // Mark notification as read and save
    notification.read = true;
    await notification.save();
    
    // Save the current user
    await req.user.save();
    
    res.json({ message: 'Friend request declined' });
  } catch (err) {
    console.error('Error declining friend request:', err);
    res.status(400).json({ error: err.message });
  }
};

// Get all users (for user discovery)
export const getAllUsers = async (req, res) => {
  try {
    // Get all users except the current user
    const users = await User.find({ 
      _id: { $ne: req.user._id } 
    }, 'username profileImage bio').limit(50);
    
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Clear all notifications
export const clearAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
