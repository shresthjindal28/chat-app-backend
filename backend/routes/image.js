import express from 'express'
import auth from '../middleware/auth.js'
import multer from 'multer'
import { uploadImage, getImages, deleteImage } from '../controllers/image.js'
const upload = multer({ dest: 'uploads/' })

const router = express.Router()
router.post('/', auth, upload.single('image'), uploadImage)
router.get('/', auth, getImages)
router.delete('/:id', auth, deleteImage)
export default router
