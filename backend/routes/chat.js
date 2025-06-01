import express from 'express'
import auth from '../middleware/auth.js'
import multer from 'multer'
import { getPeers, getHistory, sendMessage, getUnreadCounts, markRead, sendImageMessage, sendVoiceMessage } from '../controllers/chat.js'

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
    if (file.fieldname === 'image' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images are allowed'));
    }
    if (file.fieldname === 'audio' && !file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio files are allowed'));
    }
    cb(null, true);
  }
});

const router = express.Router()
router.get('/peers', auth, getPeers)
router.get('/history/:peerId', auth, getHistory)
router.post('/message', auth, sendMessage)
router.get('/unread-counts', auth, getUnreadCounts)
router.post('/mark-read/:peerId', auth, markRead)
router.post('/image-message', auth, upload.single('image'), sendImageMessage)
router.post('/voice-message', auth, upload.single('audio'), sendVoiceMessage)
export default router
