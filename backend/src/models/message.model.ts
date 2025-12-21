import mongoose, { Document, Schema, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface IToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface IMessage extends Document {
  messageId: string;
  conversationId: Types.ObjectId | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensInput: number;
  tokensOutput: number;
  modelUsed: string;
  costUsd: number;
  toolCalls: IToolCall[];
  toolResults: IToolResult[];
  correlationId: string; // For tracking async requests
  createdAt: Date;
  updatedAt: Date;
}

const toolCallSchema = new Schema<IToolCall>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    function: {
      name: { type: String, required: true },
      arguments: { type: String, default: '{}' },
    },
  },
  { _id: false }
);

const toolResultSchema = new Schema<IToolResult>(
  {
    toolCallId: { type: String, required: true },
    result: { type: String, required: true },
    isError: { type: Boolean, default: false },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    messageId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.Mixed, // Can be ObjectId or string UUID
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokensInput: {
      type: Number,
      default: 0,
    },
    tokensOutput: {
      type: Number,
      default: 0,
    },
    modelUsed: {
      type: String,
      default: 'anthropic/claude-sonnet-4',
    },
    costUsd: {
      type: Number,
      default: 0,
    },
    toolCalls: {
      type: [toolCallSchema],
      default: [],
    },
    toolResults: {
      type: [toolResultSchema],
      default: [],
    },
    correlationId: {
      type: String,
      default: '',
      index: true, // For async request tracking
    },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

// Compound indexes for common queries
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, role: 1 });
messageSchema.index({ correlationId: 1 }, { sparse: true });

export const Message = mongoose.model<IMessage>('Message', messageSchema);

export default Message;
