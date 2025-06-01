import express from 'express'
import auth from '../middleware/auth.js'
import { chatWithAI } from '../controllers/ai.js'
const router = express.Router()

router.post('/chat', auth, chatWithAI)
export default router
