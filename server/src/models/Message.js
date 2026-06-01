import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { versionKey: false }
);

messageSchema.index({ roomId: 1, timestamp: -1 });

export const Message = mongoose.model("Message", messageSchema);
