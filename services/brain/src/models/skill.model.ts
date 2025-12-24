import mongoose, { Document, Schema } from 'mongoose';

export interface ISkill extends Document {
    name: string;           // lowercase-with-hyphens, max 64 chars
    description: string;    // max 1024 chars, used for matching
    allowedTools: string[]; // e.g., ['Read', 'Grep', 'Glob']
    content: string;        // full SKILL.md content (markdown part)
    path: string;           // file path where skill is located
    type: 'personal' | 'project' | 'plugin';
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            maxlength: 64,
            match: /^[a-z0-9-]+$/,
        },
        description: {
            type: String,
            required: true,
            maxlength: 1024,
        },
        allowedTools: {
            type: [String],
            default: [],
        },
        content: {
            type: String,
            required: true,
        },
        path: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['personal', 'project', 'plugin'],
            default: 'project',
        },
        enabled: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        collection: 'skills',
    }
);

// Indexes for efficient querying
SkillSchema.index({ name: 1 });
SkillSchema.index({ type: 1 });
SkillSchema.index({ enabled: 1 });

export const Skill = mongoose.model<ISkill>('Skill', SkillSchema);

export default Skill;
