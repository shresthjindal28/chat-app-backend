import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      required: true,
      enum: ['friendRequest', 'friendAccepted', 'message', 'system']
    },
    content: {
      type: String
    },
    senderName: {
      type: String
    },
    read: {
      type: Boolean,
      default: false
    },
    data: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
