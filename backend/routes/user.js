import express from 'express';
import auth from '../middleware/auth.js';
import multer from 'multer';
import { getMe, updateMe, updatePassword, uploadProfileImage, getNotificationSettings, updateNotificationSettings,
  getFriends, removeFriend, getNotifications, markNotificationsRead, handleNotificationAction, sendFriendRequest, acceptFriendRequest, blockUser, reportUser, acceptFriendRequestFromNotification, declineFriendRequestFromNotification, getAllUsers, clearAllNotifications } from '../controllers/user.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only images and audio
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

router.get('/me', auth, getMe);
router.patch('/me', auth, updateMe);
router.put('/update-profile', auth, updateMe);
router.patch('/password', auth, updatePassword);
router.post('/upload-profile-image', auth, upload.single('image'), uploadProfileImage);

// Notification settings routes
router.get('/notification-settings', auth, getNotificationSettings);
router.post('/notification-settings', auth, updateNotificationSettings);

// Friends management routes
router.get('/friends', auth, getFriends);
router.post('/remove-friend', auth, removeFriend);
router.post('/send-friend-request', auth, sendFriendRequest);
router.post('/accept-friend-request', auth, acceptFriendRequest);

// Notification routes
router.get('/notifications', auth, getNotifications);
router.post('/mark-notifications-read', auth, markNotificationsRead);
router.delete('/notifications', auth, clearAllNotifications);
router.post('/handle-notification-action', auth, handleNotificationAction);

// Friend request handling via notification IDs
router.post('/accept-friend-request/:notificationId', auth, acceptFriendRequestFromNotification);
router.post('/decline-friend-request/:notificationId', auth, declineFriendRequestFromNotification);

// Block and report routes
router.post('/block-user', auth, blockUser);
router.post('/report-user', auth, reportUser);

// Users
router.get('/all-users', auth, getAllUsers);

export default router;
