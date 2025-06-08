import express from 'express'
import { signup, login, logout, verifyOtp } from '../controllers/auth.js'
const router = express.Router()

router.post('/signup', signup)
router.post('/login', login)
router.post('/logout', logout)
router.post('/verify-otp', verifyOtp)

export default router
