import WebSocket from 'ws';
import chalk from 'chalk';

/**
 * Task Progress Event Types (mirroring backend)
 */
export interface TaskProgressEvent {
  type: 'todo_created' | 'task_started' | 'task_completed' | 'task_failed' | 'all_complete' | 'connected' | 'subscribed' | 'pong';
  sessionId?: string;
  timestamp: string;
  clientId?: string;
  message?: string;
  data?: {
    todos?: TodoItem[];
    currentTask?: TodoItem;
    completedTasks?: number;
    totalTasks?: number;
    message?: string;
    error?: string;
  };
}

export interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  order: number;
}

/**
 * Task Progress Display - WebSocket client for real-time task progress
 */
export class TaskProgressDisplay {
  private ws: WebSocket | null = null;
  private apiUrl: string = '';
  private sessionId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 2000;
  private isConnected: boolean = false;
  private onConnectCallback?: () => void;
  private todos: TodoItem[] = [];

  /**
   * Connect to the WebSocket server
   */
  connect(apiUrl: string, sessionId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiUrl = apiUrl;
      this.sessionId = sessionId || null;

      const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws';

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Subscribe to session if provided
          if (this.sessionId) {
            this.subscribeToSession(this.sessionId);
          }

          if (this.onConnectCallback) {
            this.onConnectCallback();
          }

          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const event = JSON.parse(data.toString()) as TaskProgressEvent;
            this.handleEvent(event);
          } catch {
            // Ignore invalid messages
          }
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;

          // Attempt reconnection if not intentionally closed
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.connect(this.apiUrl, this.sessionId || undefined).catch(() => {
                // Silently fail reconnection
              });
            }, this.reconnectDelay);
          }
        });

        this.ws.on('error', (error) => {
          if (!this.isConnected) {
            reject(error);
          }
        });

        // Timeout connection attempt
        setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a specific session's updates
   */
  subscribeToSession(sessionId: string): void {
    this.sessionId = sessionId;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }
  }

  /**
   * Handle incoming WebSocket events
   */
  private handleEvent(event: TaskProgressEvent): void {
    switch (event.type) {
      case 'connected':
        // Connection confirmed
        break;

      case 'subscribed':
        // Subscription confirmed
        break;

      case 'todo_created':
        this.displayTodoList(event);
        break;

      case 'task_started':
        this.displayTaskStarted(event);
        break;

      case 'task_completed':
        this.displayTaskCompleted(event);
        break;

      case 'task_failed':
        this.displayTaskFailed(event);
        break;

      case 'all_complete':
        this.displayAllComplete(event);
        break;

      case 'pong':
        // Heartbeat response - ignore
        break;
    }
  }

  /**
   * Display the todo list when created
   */
  private displayTodoList(event: TaskProgressEvent): void {
    if (!event.data?.todos) return;

    this.todos = event.data.todos;

    console.log(chalk.cyan('\n  ╭─────────────────────────────────────────╮'));
    console.log(chalk.cyan('  │') + chalk.bold('           Task List Created             ') + chalk.cyan('│'));
    console.log(chalk.cyan('  ╰─────────────────────────────────────────╯\n'));

    for (const todo of this.todos) {
      const index = todo.order + 1;
      console.log(chalk.gray(`    ${index}. [ ] ${todo.content}`));
    }
    console.log('');
  }

  /**
   * Display when a task starts
   */
  private displayTaskStarted(event: TaskProgressEvent): void {
    if (!event.data?.currentTask) return;

    const task = event.data.currentTask;
    const progress = event.data.completedTasks !== undefined && event.data.totalTasks
      ? `(${event.data.completedTasks}/${event.data.totalTasks})`
      : '';

    console.log(chalk.yellow(`  ⏳ ${task.activeForm}... ${chalk.gray(progress)}`));
  }

  /**
   * Display when a task completes
   */
  private displayTaskCompleted(event: TaskProgressEvent): void {
    if (!event.data?.currentTask) return;

    const task = event.data.currentTask;
    const progress = event.data.completedTasks !== undefined && event.data.totalTasks
      ? `${event.data.completedTasks}/${event.data.totalTasks}`
      : '';

    console.log(chalk.green(`  ✅ Completed: ${task.content}`));
    if (progress) {
      console.log(chalk.gray(`     Progress: ${progress}`));
    }
  }

  /**
   * Display when a task fails
   */
  private displayTaskFailed(event: TaskProgressEvent): void {
    if (!event.data?.currentTask) return;

    const task = event.data.currentTask;
    const error = event.data.error || 'Unknown error';

    console.log(chalk.red(`  ❌ Failed: ${task.content}`));
    console.log(chalk.red(`     Error: ${error}`));
  }

  /**
   * Display when all tasks complete
   */
  private displayAllComplete(event: TaskProgressEvent): void {
    const totalTasks = event.data?.totalTasks || 0;

    console.log(chalk.green.bold('\n  🎉 All tasks completed successfully!'));
    if (totalTasks > 0) {
      console.log(chalk.gray(`     Total tasks: ${totalTasks}`));
    }
    console.log('');
  }

  /**
   * Send a ping to keep connection alive
   */
  ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Set callback for when connection is established
   */
  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.isConnected = false;
  }
}

// Export singleton instance for easy use
export const taskProgress = new TaskProgressDisplay();
export default TaskProgressDisplay;
