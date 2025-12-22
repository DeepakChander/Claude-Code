import { wsService, TaskProgressEvent, TodoItem } from './websocket.service';
import logger from '../utils/logger';

/**
 * Input format for creating todos (from AI or API)
 */
interface TodoInput {
  content: string;
  activeForm: string;
}

/**
 * Task Progress Service
 * Manages todo lists and broadcasts progress updates via WebSocket
 */
class TaskProgressService {
  private sessionTodos: Map<string, TodoItem[]> = new Map();

  /**
   * Create initial todo list from input
   * This should be called BEFORE any work begins
   */
  createTodoList(sessionId: string, todos: TodoInput[]): TodoItem[] {
    const todoList: TodoItem[] = todos.map((t, i) => ({
      id: `todo-${sessionId}-${i}`,
      content: t.content,
      activeForm: t.activeForm,
      status: 'pending',
      order: i,
    }));

    this.sessionTodos.set(sessionId, todoList);

    // Broadcast todo list creation
    const event: TaskProgressEvent = {
      type: 'todo_created',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        todos: todoList,
        totalTasks: todoList.length,
        completedTasks: 0,
        message: `Created ${todoList.length} task${todoList.length !== 1 ? 's' : ''}`,
      },
    };

    wsService.broadcast(event);

    logger.info('Todo list created', {
      sessionId,
      taskCount: todoList.length,
      tasks: todoList.map(t => t.content),
    });

    return todoList;
  }

  /**
   * Mark task as started (in_progress)
   */
  startTask(sessionId: string, taskIdOrIndex: string | number): TodoItem | null {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) {
      logger.warn('Cannot start task - session not found', { sessionId });
      return null;
    }

    const task = typeof taskIdOrIndex === 'number'
      ? todos[taskIdOrIndex]
      : todos.find(t => t.id === taskIdOrIndex);

    if (!task) {
      logger.warn('Cannot start task - task not found', { sessionId, taskIdOrIndex });
      return null;
    }

    task.status = 'in_progress';

    const completedCount = todos.filter(t => t.status === 'completed').length;

    const event: TaskProgressEvent = {
      type: 'task_started',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        currentTask: task,
        completedTasks: completedCount,
        totalTasks: todos.length,
        message: task.activeForm,
      },
    };

    wsService.broadcast(event);

    logger.info('Task started', {
      sessionId,
      taskId: task.id,
      task: task.content,
      progress: `${completedCount}/${todos.length}`,
    });

    return task;
  }

  /**
   * Mark task as completed
   */
  completeTask(sessionId: string, taskIdOrIndex: string | number): TodoItem | null {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) {
      logger.warn('Cannot complete task - session not found', { sessionId });
      return null;
    }

    const task = typeof taskIdOrIndex === 'number'
      ? todos[taskIdOrIndex]
      : todos.find(t => t.id === taskIdOrIndex);

    if (!task) {
      logger.warn('Cannot complete task - task not found', { sessionId, taskIdOrIndex });
      return null;
    }

    task.status = 'completed';

    const completedCount = todos.filter(t => t.status === 'completed').length;

    const event: TaskProgressEvent = {
      type: 'task_completed',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        currentTask: task,
        completedTasks: completedCount,
        totalTasks: todos.length,
        message: `Completed: ${task.content}`,
      },
    };

    wsService.broadcast(event);

    logger.info('Task completed', {
      sessionId,
      taskId: task.id,
      task: task.content,
      progress: `${completedCount}/${todos.length}`,
    });

    // Check if all tasks are complete
    if (completedCount === todos.length) {
      const allCompleteEvent: TaskProgressEvent = {
        type: 'all_complete',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          todos,
          completedTasks: completedCount,
          totalTasks: todos.length,
          message: 'All tasks completed successfully',
        },
      };

      wsService.broadcast(allCompleteEvent);

      logger.info('All tasks completed', {
        sessionId,
        totalTasks: todos.length,
      });
    }

    return task;
  }

  /**
   * Mark task as failed
   */
  failTask(sessionId: string, taskIdOrIndex: string | number, error: string): TodoItem | null {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) {
      logger.warn('Cannot fail task - session not found', { sessionId });
      return null;
    }

    const task = typeof taskIdOrIndex === 'number'
      ? todos[taskIdOrIndex]
      : todos.find(t => t.id === taskIdOrIndex);

    if (!task) {
      logger.warn('Cannot fail task - task not found', { sessionId, taskIdOrIndex });
      return null;
    }

    task.status = 'failed';

    const completedCount = todos.filter(t => t.status === 'completed').length;

    const event: TaskProgressEvent = {
      type: 'task_failed',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        currentTask: task,
        completedTasks: completedCount,
        totalTasks: todos.length,
        message: `Failed: ${task.content}`,
        error,
      },
    };

    wsService.broadcast(event);

    logger.error('Task failed', {
      sessionId,
      taskId: task.id,
      task: task.content,
      error,
    });

    return task;
  }

  /**
   * Get todos for a session
   */
  getTodos(sessionId: string): TodoItem[] | undefined {
    return this.sessionTodos.get(sessionId);
  }

  /**
   * Get current task (first in_progress task)
   */
  getCurrentTask(sessionId: string): TodoItem | undefined {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return undefined;
    return todos.find(t => t.status === 'in_progress');
  }

  /**
   * Get next pending task
   */
  getNextTask(sessionId: string): TodoItem | undefined {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return undefined;
    return todos.find(t => t.status === 'pending');
  }

  /**
   * Get progress summary
   */
  getProgress(sessionId: string): { completed: number; total: number; percent: number } | null {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return null;

    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percent };
  }

  /**
   * Add a new task to existing list
   */
  addTask(sessionId: string, todo: TodoInput): TodoItem | null {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) {
      logger.warn('Cannot add task - session not found', { sessionId });
      return null;
    }

    const newTask: TodoItem = {
      id: `todo-${sessionId}-${todos.length}`,
      content: todo.content,
      activeForm: todo.activeForm,
      status: 'pending',
      order: todos.length,
    };

    todos.push(newTask);

    logger.info('Task added', {
      sessionId,
      taskId: newTask.id,
      task: newTask.content,
      totalTasks: todos.length,
    });

    return newTask;
  }

  /**
   * Remove a task from the list
   */
  removeTask(sessionId: string, taskIdOrIndex: string | number): boolean {
    const todos = this.sessionTodos.get(sessionId);
    if (!todos) return false;

    const index = typeof taskIdOrIndex === 'number'
      ? taskIdOrIndex
      : todos.findIndex(t => t.id === taskIdOrIndex);

    if (index < 0 || index >= todos.length) return false;

    const removed = todos.splice(index, 1)[0];

    // Reorder remaining tasks
    todos.forEach((t, i) => {
      t.order = i;
    });

    logger.info('Task removed', {
      sessionId,
      taskId: removed.id,
      task: removed.content,
    });

    return true;
  }

  /**
   * Clear all todos for a session
   */
  clearSession(sessionId: string): void {
    this.sessionTodos.delete(sessionId);
    logger.info('Session todos cleared', { sessionId });
  }

  /**
   * Update todo list from TodoWrite tool call
   * This syncs the internal state with what the AI agent reports
   */
  updateFromTodoWrite(
    sessionId: string,
    todos: Array<{ content: string; status: string; activeForm: string }>
  ): void {
    const existingTodos = this.sessionTodos.get(sessionId);

    // If no existing todos, create new list
    if (!existingTodos) {
      const todoInputs = todos.map(t => ({
        content: t.content,
        activeForm: t.activeForm,
      }));
      this.createTodoList(sessionId, todoInputs);
      return;
    }

    // Update existing todos with new statuses
    for (const update of todos) {
      const existing = existingTodos.find(t => t.content === update.content);
      if (existing) {
        const oldStatus = existing.status;
        const newStatus = update.status as TodoItem['status'];

        // Detect status changes and broadcast
        if (oldStatus !== newStatus) {
          if (newStatus === 'in_progress' && oldStatus === 'pending') {
            this.startTask(sessionId, existing.id);
          } else if (newStatus === 'completed' && oldStatus !== 'completed') {
            this.completeTask(sessionId, existing.id);
          } else if (newStatus === 'failed') {
            this.failTask(sessionId, existing.id, 'Task failed');
          }
        }
      } else {
        // New task - add it
        this.addTask(sessionId, {
          content: update.content,
          activeForm: update.activeForm,
        });
      }
    }
  }
}

// Export singleton instance
export const taskProgressService = new TaskProgressService();
export default taskProgressService;
