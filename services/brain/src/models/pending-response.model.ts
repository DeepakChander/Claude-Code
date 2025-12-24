import mongoose, { Document, Schema, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type PendingResponseStatus = 'pending' | 'processing' | 'completed' | 'delivered' | 'expired' | 'failed';

export interface IRequestPayload {
  prompt: string;
  model: string;
  sessionId?: string;
  workspacePath?: string;
  continueConversation?: boolean;
}

export interface IResponseData {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  sessionId?: string;
  toolCalls?: object[];
  error?: string;
}

export interface IPendingResponse extends Document {
  correlationId: string;
  userId: Types.ObjectId | string;
  conversationId: Types.ObjectId | string;
  requestPayload: IRequestPayload;
  response: IResponseData | null;
  status: PendingResponseStatus;
  errorMessage: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  deliveredAt: Date | null;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
}

const requestPayloadSchema = new Schema<IRequestPayload>(
  {
    prompt: { type: String, required: true },
    model: { type: String, default: 'anthropic/claude-sonnet-4' },
    sessionId: { type: String },
    workspacePath: { type: String },
    continueConversation: { type: Boolean, default: false },
  },
  { _id: false }
);

const responseDataSchema = new Schema<IResponseData>(
  {
    content: { type: String, required: true },
    tokensInput: { type: Number, default: 0 },
    tokensOutput: { type: Number, default: 0 },
    sessionId: { type: String },
    toolCalls: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String },
  },
  { _id: false }
);

const pendingResponseSchema = new Schema<IPendingResponse>(
  {
    correlationId: {
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
    conversationId: {
      type: Schema.Types.Mixed, // Can be ObjectId or string UUID
      required: true,
      index: true,
    },
    requestPayload: {
      type: requestPayloadSchema,
      required: true,
    },
    response: {
      type: responseDataSchema,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'delivered', 'expired', 'failed'],
      default: 'pending',
      index: true,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingCompletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'pending_responses',
  }
);

// TTL index - automatically delete documents after expiresAt
pendingResponseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common queries
pendingResponseSchema.index({ userId: 1, status: 1 });
pendingResponseSchema.index({ userId: 1, status: 1, createdAt: -1 });
pendingResponseSchema.index({ conversationId: 1, status: 1 });
pendingResponseSchema.index({ status: 1, createdAt: 1 }); // For worker polling

// Methods
pendingResponseSchema.methods.markAsProcessing = function () {
  this.status = 'processing';
  this.processingStartedAt = new Date();
  return this.save();
};

pendingResponseSchema.methods.markAsCompleted = function (responseData: IResponseData) {
  this.status = 'completed';
  this.response = responseData;
  this.processingCompletedAt = new Date();
  return this.save();
};

pendingResponseSchema.methods.markAsDelivered = function () {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

pendingResponseSchema.methods.markAsFailed = function (errorMessage: string) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.retryCount += 1;
  return this.save();
};

// Statics
pendingResponseSchema.statics.findPendingByUser = function (userId: string) {
  return this.find({
    userId,
    status: { $in: ['pending', 'processing', 'completed'] },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

pendingResponseSchema.statics.findCompletedByUser = function (userId: string) {
  return this.find({
    userId,
    status: 'completed',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

pendingResponseSchema.statics.findUnprocessed = function (limit: number = 10) {
  return this.find({
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

export const PendingResponse = mongoose.model<IPendingResponse>('PendingResponse', pendingResponseSchema);

export default PendingResponse;
