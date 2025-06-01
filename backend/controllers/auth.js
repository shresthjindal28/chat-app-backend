import User from '../models/User.js'
import jwt from 'jsonwebtoken'

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (await User.findOne({ email })) {
      return res.status(400).json({ error: 'Email already in use' })
    }
    if (await User.findOne({ username })) {
      return res.status(400).json({ error: 'Username already in use' })
    }
    const user = await User.create({ username, email, password })
    res.status(201).json({ message: 'User created' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid credentials' })
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, profileImage: user.profileImage } })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export const logout = (req, res) => {
  res.json({ message: 'Logged out' })
}
