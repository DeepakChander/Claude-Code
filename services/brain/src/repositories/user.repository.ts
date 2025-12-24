import { User, IUser } from '../models';
import logger from '../utils/logger';

/**
 * Create a new user
 */
export const create = async (input: {
  username: string;
  email: string;
  passwordHash: string;
}): Promise<IUser> => {
  try {
    const user = new User({
      username: input.username,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      isActive: true,
    });

    await user.save();
    logger.info('User created', { userId: user.userId, email: user.email });
    return user;
  } catch (error) {
    logger.error('Failed to create user', { email: input.email, error });
    throw error;
  }
};

/**
 * Find user by ID
 */
export const findById = async (userId: string): Promise<IUser | null> => {
  try {
    return await User.findOne({ userId });
  } catch (error) {
    logger.error('Failed to find user by ID', { userId, error });
    throw error;
  }
};

/**
 * Find user by email
 */
export const findByEmail = async (email: string): Promise<IUser | null> => {
  try {
    return await User.findOne({ email: email.toLowerCase() });
  } catch (error) {
    logger.error('Failed to find user by email', { email, error });
    throw error;
  }
};

/**
 * Find user by username
 */
export const findByUsername = async (username: string): Promise<IUser | null> => {
  try {
    return await User.findOne({ username });
  } catch (error) {
    logger.error('Failed to find user by username', { username, error });
    throw error;
  }
};

/**
 * Update user
 */
export const update = async (
  userId: string,
  input: Partial<{
    username: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
  }>
): Promise<IUser | null> => {
  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { $set: { ...input, updatedAt: new Date() } },
      { new: true }
    );
    if (user) {
      logger.info('User updated', { userId });
    }
    return user;
  } catch (error) {
    logger.error('Failed to update user', { userId, error });
    throw error;
  }
};

/**
 * Delete user
 */
export const deleteUser = async (userId: string): Promise<boolean> => {
  try {
    const result = await User.deleteOne({ userId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Failed to delete user', { userId, error });
    throw error;
  }
};

/**
 * Find all active users
 */
export const findActive = async (
  options: { limit?: number; offset?: number } = {}
): Promise<IUser[]> => {
  const { limit = 50, offset = 0 } = options;
  try {
    return await User.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);
  } catch (error) {
    logger.error('Failed to find active users', { error });
    throw error;
  }
};

/**
 * Check if email exists
 */
export const emailExists = async (email: string): Promise<boolean> => {
  try {
    const count = await User.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  } catch (error) {
    logger.error('Failed to check email exists', { email, error });
    throw error;
  }
};

/**
 * Check if username exists
 */
export const usernameExists = async (username: string): Promise<boolean> => {
  try {
    const count = await User.countDocuments({ username });
    return count > 0;
  } catch (error) {
    logger.error('Failed to check username exists', { username, error });
    throw error;
  }
};

export default {
  create,
  findById,
  findByEmail,
  findByUsername,
  update,
  delete: deleteUser,
  findActive,
  emailExists,
  usernameExists,
};
