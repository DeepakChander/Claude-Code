// Memory Manager
// Manages user preferences, recent tasks, and learnings

import logger from '../utils/logger';

interface UserPreferences {
  defaultPlatform?: string;
  tone?: string;
  timezone?: string;
  language?: string;
  notificationPrefs?: {
    email?: boolean;
    push?: boolean;
  };
  customInstructions?: string;
}

interface RecentTask {
  taskId: string;
  type: string;
  timestamp: number;
  success: boolean;
  summary: string;
}

interface Learning {
  id: string;
  type: string;
  content: string;
  source: 'success' | 'failure' | 'research';
  timestamp: number;
  tags: string[];
}

interface UserMemory {
  preferences: UserPreferences;
  recentTasks: RecentTask[];
  learnings: Learning[];
  lastActive: number;
}

class MemoryManager {
  private cache: Map<string, UserMemory> = new Map();
  private maxRecentTasks = 50;
  private maxLearnings = 100;

  // Get or create user memory
  async getUserMemory(userId: string): Promise<UserMemory> {
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    // In production, load from database
    const memory: UserMemory = {
      preferences: {},
      recentTasks: [],
      learnings: [],
      lastActive: Date.now(),
    };

    this.cache.set(userId, memory);
    return memory;
  }

  // Update user preferences
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void> {
    const memory = await this.getUserMemory(userId);
    memory.preferences = { ...memory.preferences, ...preferences };
    memory.lastActive = Date.now();

    logger.debug('Updated user preferences', { userId, preferences: Object.keys(preferences) });
  }

  // Get user preferences
  async getPreferences(userId: string): Promise<UserPreferences> {
    const memory = await this.getUserMemory(userId);
    return memory.preferences;
  }

  // Add recent task
  async addRecentTask(userId: string, task: RecentTask): Promise<void> {
    const memory = await this.getUserMemory(userId);

    memory.recentTasks.unshift(task);

    // Trim to max size
    if (memory.recentTasks.length > this.maxRecentTasks) {
      memory.recentTasks = memory.recentTasks.slice(0, this.maxRecentTasks);
    }

    memory.lastActive = Date.now();
  }

  // Get recent tasks
  async getRecentTasks(userId: string, limit: number = 10): Promise<RecentTask[]> {
    const memory = await this.getUserMemory(userId);
    return memory.recentTasks.slice(0, limit);
  }

  // Get recent tasks by type
  async getRecentTasksByType(userId: string, type: string, limit: number = 5): Promise<RecentTask[]> {
    const memory = await this.getUserMemory(userId);
    return memory.recentTasks
      .filter(task => task.type === type)
      .slice(0, limit);
  }

  // Add learning
  async addLearning(userId: string, learning: Omit<Learning, 'id' | 'timestamp'>): Promise<void> {
    const memory = await this.getUserMemory(userId);

    const newLearning: Learning = {
      ...learning,
      id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    memory.learnings.unshift(newLearning);

    // Trim to max size
    if (memory.learnings.length > this.maxLearnings) {
      memory.learnings = memory.learnings.slice(0, this.maxLearnings);
    }

    memory.lastActive = Date.now();
    logger.debug('Added learning', { userId, type: learning.type, source: learning.source });
  }

  // Get learnings
  async getLearnings(userId: string, limit: number = 20): Promise<Learning[]> {
    const memory = await this.getUserMemory(userId);
    return memory.learnings.slice(0, limit);
  }

  // Get learnings by type
  async getLearningsByType(userId: string, type: string): Promise<Learning[]> {
    const memory = await this.getUserMemory(userId);
    return memory.learnings.filter(l => l.type === type);
  }

  // Get learnings by tag
  async getLearningsByTag(userId: string, tag: string): Promise<Learning[]> {
    const memory = await this.getUserMemory(userId);
    return memory.learnings.filter(l => l.tags.includes(tag));
  }

  // Search learnings
  async searchLearnings(userId: string, query: string): Promise<Learning[]> {
    const memory = await this.getUserMemory(userId);
    const queryLower = query.toLowerCase();

    return memory.learnings.filter(l =>
      l.content.toLowerCase().includes(queryLower) ||
      l.type.toLowerCase().includes(queryLower) ||
      l.tags.some(tag => tag.toLowerCase().includes(queryLower))
    );
  }

  // Build context for task execution
  async buildContext(userId: string, taskType: string): Promise<{
    preferences: UserPreferences;
    recentSimilar: RecentTask[];
    relevantLearnings: Learning[];
    customInstructions?: string;
  }> {
    const memory = await this.getUserMemory(userId);

    return {
      preferences: memory.preferences,
      recentSimilar: memory.recentTasks.filter(t => t.type === taskType).slice(0, 5),
      relevantLearnings: memory.learnings.filter(l => l.type === taskType).slice(0, 10),
      customInstructions: memory.preferences.customInstructions,
    };
  }

  // Clear user memory
  async clearMemory(userId: string): Promise<void> {
    this.cache.delete(userId);
    logger.info('Cleared user memory', { userId });
  }

  // Get memory stats
  getStats(): { cachedUsers: number; totalTasks: number; totalLearnings: number } {
    let totalTasks = 0;
    let totalLearnings = 0;

    for (const memory of this.cache.values()) {
      totalTasks += memory.recentTasks.length;
      totalLearnings += memory.learnings.length;
    }

    return {
      cachedUsers: this.cache.size,
      totalTasks,
      totalLearnings,
    };
  }
}

// Singleton instance
export const memoryManager = new MemoryManager();

export default MemoryManager;
