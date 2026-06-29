import mongoose from "mongoose";

const boardElementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    rotation: { type: Number, default: 0 },
    text: { type: String, default: "" },
    points: {
      type: [[Number]],
      default: undefined
    },
    stroke: { type: String, default: "#f8fafc" },
    fill: { type: String, default: "transparent" },
    strokeWidth: { type: Number, default: 4 },
    opacity: { type: Number, default: 1 }
  },
  { _id: false }
);

const boardSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    elements: {
      type: [boardElementSchema],
      default: []
    },
    background: {
      type: String,
      default: "#0f172a"
    },
    version: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

export const Board = mongoose.model("Board", boardSchema);
