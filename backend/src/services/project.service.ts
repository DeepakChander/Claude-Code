import { Project, IProject } from '../models/project.model';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

/**
 * Ensure a project exists for the user.
 * Enforces strict "One Project Per User" rule.
 */
export const ensureUserProject = async (userId: string): Promise<IProject> => {
    try {
        // Check if project exists
        let project = await Project.findOne({ userId });

        if (!project) {
            logger.info('No project found for user, creating default project', { userId });
            // Create new default project
            project = await Project.create({
                projectId: uuidv4(),
                userId,
                name: 'Default Project',
                description: 'Automatically created default project',
            });
        }

        return project;
    } catch (error) {
        logger.error('Failed to ensure user project', { userId, error });
        throw error;
    }
};

export const getProjectByUserId = async (userId: string): Promise<IProject | null> => {
    return Project.findOne({ userId });
};

export default {
    ensureUserProject,
    getProjectByUserId,
};
