import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    bio: {
      type: String,
      default: '',
    },
    profileImage: {
      type: String,
      default: '',
    },
    notificationSettings: {
      messages: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      desktop: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: true },
      messagePreview: { type: Boolean, default: true },
      showSender: { type: Boolean, default: true }
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    receivedRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    otp: { type: String }, // Remove required: true since it's only needed during signup
    otpExpires: { type: Date }, // Optional: for expiry
    otpVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Check if two users are friends
userSchema.methods.isFriendWith = function (otherUserId) {
  return (this.friends || []).map(id => id.toString()).includes(otherUserId.toString());
};

const User = mongoose.model('User', userSchema)

export default User
