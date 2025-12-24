import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUser extends Document {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: function (_doc, ret: Record<string, any>) {
        delete ret._id;
        delete ret.passwordHash;
      },
    },
  }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isActive: 1 });

export const User = mongoose.model<IUser>('User', userSchema);

export default User;
