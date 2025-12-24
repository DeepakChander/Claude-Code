// Tavily Search Service
// Web search API integration for the eval engine research protocol

import logger from '../utils/logger';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

class TavilyService {
  private apiKey: string;
  private baseUrl: string = 'https://api.tavily.com';
  private timeout: number = 30000;

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async search(query: string, options?: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
  }): Promise<TavilyResponse> {
    if (!this.isConfigured()) {
      logger.warn('Tavily API key not configured');
      return {
        query,
        results: [],
        answer: undefined,
      };
    }

    const maxResults = options?.maxResults || 5;
    const searchDepth = options?.searchDepth || 'basic';
    const includeAnswer = options?.includeAnswer ?? true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
          search_depth: searchDepth,
          include_answer: includeAnswer,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        results?: Array<{
          title: string;
          url: string;
          content: string;
          score?: number;
        }>;
        answer?: string;
      };

      logger.info('Tavily search completed', {
        query,
        resultsCount: data.results?.length || 0,
        hasAnswer: !!data.answer,
      });

      return {
        query,
        results: (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score || 0,
        })),
        answer: data.answer,
      };

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error('Tavily search timeout', { query });
        throw new Error('Search request timed out');
      }

      logger.error('Tavily search failed', {
        query,
        error: (error as Error).message,
      });

      return {
        query,
        results: [],
        answer: undefined,
      };
    }
  }

  async researchTopic(topic: string, context?: string): Promise<{
    findings: string[];
    sources: { title: string; url: string }[];
    recommendations: string[];
  }> {
    const query = context
      ? `${topic} ${context} best practices solutions 2025`
      : `${topic} best practices solutions 2025`;

    const response = await this.search(query, {
      maxResults: 5,
      searchDepth: 'advanced',
      includeAnswer: true,
    });

    const findings: string[] = [];
    const recommendations: string[] = [];
    const sources: { title: string; url: string }[] = [];

    // Extract answer as primary finding
    if (response.answer) {
      findings.push(response.answer);
    }

    // Process search results
    for (const result of response.results) {
      sources.push({
        title: result.title,
        url: result.url,
      });

      // Extract key sentences from content
      const sentences = result.content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      for (const sentence of sentences.slice(0, 2)) {
        if (sentence.toLowerCase().includes('should') ||
            sentence.toLowerCase().includes('recommend') ||
            sentence.toLowerCase().includes('best')) {
          recommendations.push(sentence.trim());
        } else {
          findings.push(sentence.trim());
        }
      }
    }

    // Deduplicate and limit
    return {
      findings: [...new Set(findings)].slice(0, 5),
      sources: sources.slice(0, 5),
      recommendations: [...new Set(recommendations)].slice(0, 3),
    };
  }
}

// Singleton export
export const tavilyService = new TavilyService();
export default TavilyService;
