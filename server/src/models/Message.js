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
      default: "",
      maxlength: 1000
    },
    attachments: [
      {
        id: String,
        originalName: String,
        mimeType: String,
        size: Number,
        previewUrl: String,
        downloadUrl: String
      }
    ],
    reactions: {
      type: Map,
      of: [String],
      default: {}
    },
    editedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null
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
