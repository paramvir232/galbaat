import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64
    },
    activeUsers: {
      type: Number,
      default: 0,
      min: 0
    },
    locked: {
      type: Boolean,
      default: false
    },
    pinnedNotice: {
      type: String,
      default: "",
      maxlength: 240
    },
    lastActivity: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const Room = mongoose.model("Room", roomSchema);
