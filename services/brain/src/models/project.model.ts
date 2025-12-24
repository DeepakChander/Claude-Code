import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IProject extends Document {
    projectId: string;
    userId: string;
    name: string;
    description?: string;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
    {
        projectId: {
            type: String,
            default: () => uuidv4(),
            unique: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            default: 'Default Project',
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        collection: 'projects',
    }
);

// Enforce unique project name per user (optional, but good practice)
// projectSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Project = mongoose.model<IProject>('Project', projectSchema);

export default Project;
