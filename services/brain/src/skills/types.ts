// Skill System Types

export interface SkillMetadata {
  name: string;
  description: string;
  triggers: string[];
  platforms?: string[];
  requires_windmill?: boolean;
  priority?: number;
  version?: string;
  author?: string;
}

export interface SkillWorkflow {
  name: string;
  steps: string[];
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  systemPrompt: string;
  workflows: SkillWorkflow[];
  windmillScripts: string[];
  content: string;
  path: string;
}

export interface SkillMatch {
  skill: SkillDefinition;
  confidence: number;
  matchedTriggers: string[];
}

export interface SkillContext {
  skill: SkillDefinition;
  userContext?: Record<string, unknown>;
  conversationHistory?: string[];
}

export interface SkillExecutionResult {
  success: boolean;
  response: string;
  skill: string;
  windmillJobId?: string;
  metadata?: Record<string, unknown>;
}
