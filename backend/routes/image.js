import express from 'express'
import auth from '../middleware/auth.js'
import multer from 'multer'
import { uploadImage, getImages, deleteImage } from '../controllers/image.js'

// Use multer with diskStorage to preserve file extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const router = express.Router()
router.post('/', auth, upload.single('image'), uploadImage)
router.get('/', auth, getImages)
router.delete('/:id', auth, deleteImage)
export default router
