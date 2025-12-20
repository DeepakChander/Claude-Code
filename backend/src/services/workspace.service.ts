import { mkdir, rm, stat, readdir } from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';
import logger from '../utils/logger';

config();

const WORKSPACE_BASE_PATH = process.env.WORKSPACE_BASE_PATH || './workspaces';
const MAX_WORKSPACE_SIZE_MB = parseInt(process.env.MAX_WORKSPACE_SIZE_MB || '500', 10);

/**
 * Get the full path for a user's workspace
 */
export const getWorkspacePath = (userId: string, projectId: string): string => {
  // Sanitize inputs to prevent path traversal
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');

  return path.resolve(WORKSPACE_BASE_PATH, safeUserId, safeProjectId);
};

/**
 * Ensure a workspace directory exists
 */
export const ensureWorkspace = async (userId: string, projectId: string): Promise<string> => {
  const workspacePath = getWorkspacePath(userId, projectId);

  try {
    await mkdir(workspacePath, { recursive: true });
    logger.info(`Workspace ensured: ${workspacePath}`, { userId, projectId });
    return workspacePath;
  } catch (error) {
    logger.error(`Failed to create workspace: ${workspacePath}`, { userId, projectId, error });
    throw new Error(`Failed to create workspace: ${(error as Error).message}`);
  }
};

/**
 * Delete a workspace and all its contents
 */
export const deleteWorkspace = async (userId: string, projectId: string): Promise<void> => {
  const workspacePath = getWorkspacePath(userId, projectId);

  try {
    await rm(workspacePath, { recursive: true, force: true });
    logger.info(`Workspace deleted: ${workspacePath}`, { userId, projectId });
  } catch (error) {
    logger.error(`Failed to delete workspace: ${workspacePath}`, { userId, projectId, error });
    throw new Error(`Failed to delete workspace: ${(error as Error).message}`);
  }
};

/**
 * Check if a workspace exists
 */
export const workspaceExists = async (userId: string, projectId: string): Promise<boolean> => {
  const workspacePath = getWorkspacePath(userId, projectId);

  try {
    const stats = await stat(workspacePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

/**
 * Get workspace size in bytes
 */
export const getWorkspaceSize = async (dirPath: string): Promise<number> => {
  let totalSize = 0;

  try {
    const files = await readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        totalSize += await getWorkspaceSize(filePath);
      } else {
        const stats = await stat(filePath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return totalSize;
};

/**
 * Check if workspace is within size limit
 */
export const isWorkspaceWithinLimit = async (userId: string, projectId: string): Promise<boolean> => {
  const workspacePath = getWorkspacePath(userId, projectId);
  const size = await getWorkspaceSize(workspacePath);
  const maxSize = MAX_WORKSPACE_SIZE_MB * 1024 * 1024;

  return size <= maxSize;
};

/**
 * List all projects for a user
 */
export const listUserProjects = async (userId: string): Promise<string[]> => {
  const userPath = path.resolve(WORKSPACE_BASE_PATH, userId.replace(/[^a-zA-Z0-9_-]/g, ''));

  try {
    const entries = await readdir(userPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
};

/**
 * Initialize the workspaces base directory
 */
export const initWorkspacesDir = async (): Promise<void> => {
  try {
    await mkdir(WORKSPACE_BASE_PATH, { recursive: true });
    logger.info(`Workspaces directory initialized: ${WORKSPACE_BASE_PATH}`);
  } catch (error) {
    logger.error(`Failed to initialize workspaces directory`, { error });
    throw error;
  }
};

export default {
  getWorkspacePath,
  ensureWorkspace,
  deleteWorkspace,
  workspaceExists,
  getWorkspaceSize,
  isWorkspaceWithinLimit,
  listUserProjects,
  initWorkspacesDir,
};
