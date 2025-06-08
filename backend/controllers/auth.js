import User from '../models/User.js'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'

// Temporary storage for pending signups (in production, use Redis or database)
const pendingSignups = new Map();

// Helper to generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email using nodemailer
async function sendOtpEmail(email, otp) {
  // Use environment variables for SMTP config
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"ChatConnect" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your ChatConnect OTP Code',
    text: `Your OTP code is: ${otp}`,
    html: `<p>Your OTP code is: <b>${otp}</b></p>`
  });
}

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body
    // Check for missing fields
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    
    // Check for duplicate email in existing users
    if (await User.findOne({ email })) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    
    // Check for duplicate username in existing users
    if (await User.findOne({ username })) {
      return res.status(409).json({ error: 'An account with this username already exists.' });
    }
    
    const otp = generateOTP();
    
    // Store signup data temporarily with OTP (expires in 10 minutes)
    pendingSignups.set(email, {
      username,
      email,
      password,
      otp,
      timestamp: Date.now()
    });
    
    // Clean up expired entries (older than 10 minutes)
    setTimeout(() => {
      const entry = pendingSignups.get(email);
      if (entry && Date.now() - entry.timestamp > 600000) {
        pendingSignups.delete(email);
      }
    }, 600000);
    
    await sendOtpEmail(email, otp);
    res.status(200).json({ message: 'OTP sent to email. Please verify to complete registration.', otpSent: true })
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed.' })
  }
}

// OTP verification endpoint - creates user account after verification
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log('OTP verification request:', { email, otp });

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    // Check if there's a pending signup for this email
    const pendingSignup = pendingSignups.get(email);
    if (!pendingSignup) {
      return res.status(400).json({ error: 'No pending signup found for this email. Please signup again.' });
    }

    // Check if OTP has expired (10 minutes)
    if (Date.now() - pendingSignup.timestamp > 600000) {
      pendingSignups.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please signup again.' });
    }

    // Verify OTP
    if (pendingSignup.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // Create user account now
    const user = await User.create({
      username: pendingSignup.username,
      email: pendingSignup.email,
      password: pendingSignup.password,
      otp: '', // Provide empty string since OTP is no longer needed
      otpVerified: true
    });

    // Remove from pending signups
    pendingSignups.delete(email);

    res.status(201).json({ message: 'Account created successfully! You can now login.' });
  } catch (err) {
    console.error('OTP verification error:', err);
    if (err.code === 11000) {
      // Duplicate key error
      if (err.keyPattern?.email) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      if (err.keyPattern?.username) {
        return res.status(409).json({ error: 'An account with this username already exists.' });
      }
    }
    res.status(500).json({ error: err.message || 'Account creation failed.' });
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const user = await User.findOne({ email })
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid email or password.' })
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, profileImage: user.profileImage } })
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed.' })
  }
}

export const logout = (req, res) => {
  res.json({ message: 'Logged out' })
}
