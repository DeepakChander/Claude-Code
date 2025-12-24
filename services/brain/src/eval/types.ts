// Eval Loop Types

export interface Task {
  id: string;
  userId: string;
  type: string;
  input: unknown;
  expected?: unknown;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  output: unknown;
  error?: string;
  duration: number;
}

export interface EvalResult {
  success: boolean;
  result: unknown;
  retryCount: number;
  researchApplied: boolean;
  needsClarification: boolean;
  questions?: string[];
  learnings?: string[];
}

export interface ComparisonResult {
  match: boolean;
  score: number;
  differences: string[];
}

export interface ResearchResult {
  query: string;
  sources: string[];
  findings: string[];
  recommendations: string[];
}

export interface EvalConfig {
  maxRetries: number;
  similarityThreshold: number;
  enableWebResearch: boolean;
  researchTimeout: number;
}
