// API Client

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3456';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: (error as Error).message,
        },
      };
    }
  }

  // Auth
  async getToken(apiKey: string): Promise<ApiResponse<{ token: string }>> {
    return this.request('/api/auth/token', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  // Agent
  async runAgent(
    prompt: string,
    conversationId?: string
  ): Promise<ApiResponse<{ response: string; conversationId: string }>> {
    return this.request('/api/agent/run-sync', {
      method: 'POST',
      body: JSON.stringify({ prompt, conversationId }),
    });
  }

  async getConversations(): Promise<ApiResponse<{ conversations: unknown[] }>> {
    return this.request('/api/agent/conversations');
  }

  async getConversationMessages(
    conversationId: string
  ): Promise<ApiResponse<{ messages: unknown[] }>> {
    return this.request(`/api/agent/conversations/${conversationId}/messages`);
  }

  // Health
  async getHealth(): Promise<ApiResponse<{ status: string }>> {
    return this.request('/health');
  }
}

export const api = new ApiClient();
