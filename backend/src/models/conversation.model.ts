import mongoose, { Document, Schema, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IConversation extends Document {
  conversationId: string;
  userId: Types.ObjectId | string;
  title: string;
  workspacePath: string;
  sessionId: string; // Claude Code session ID for resume functionality
  modelUsed: string;
  isArchived: boolean;
  isPinned: boolean;
  totalTokensUsed: number;
  totalCostUsd: number;
  messageCount: number;
  tags: string[];
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    conversationId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.Mixed, // Can be ObjectId or string UUID
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'New Conversation',
      maxlength: 500,
    },
    workspacePath: {
      type: String,
      default: '',
    },
    sessionId: {
      type: String,
      default: '',
      index: true, // Index for resume lookups
    },
    modelUsed: {
      type: String,
      default: 'anthropic/claude-sonnet-4',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    totalTokensUsed: {
      type: Number,
      default: 0,
    },
    totalCostUsd: {
      type: Number,
      default: 0,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'conversations',
  }
);

// Compound indexes for common queries
conversationSchema.index({ userId: 1, isArchived: 1, lastMessageAt: -1 });
conversationSchema.index({ userId: 1, isPinned: -1, lastMessageAt: -1 });
conversationSchema.index({ sessionId: 1 }, { sparse: true });

// Update lastMessageAt on save
conversationSchema.pre('save', function (next) {
  if (this.isModified('messageCount')) {
    this.lastMessageAt = new Date();
  }
  next();
});

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);

export default Conversation;
