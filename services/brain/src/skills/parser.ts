// SKILL.md Parser
// Parses SKILL.md files with YAML frontmatter and markdown content

import { SkillMetadata, SkillWorkflow } from './types';
import logger from '../utils/logger';

interface ParsedSkill {
  metadata: SkillMetadata;
  systemPrompt: string;
  workflows: SkillWorkflow[];
  windmillScripts: string[];
  content: string;
}

export function parseSkillMarkdown(content: string): ParsedSkill {
  const result: ParsedSkill = {
    metadata: {
      name: 'Unknown',
      description: '',
      triggers: [],
    },
    systemPrompt: '',
    workflows: [],
    windmillScripts: [],
    content: '',
  };

  try {
    // Check for frontmatter
    if (!content.startsWith('---')) {
      logger.warn('SKILL.md missing frontmatter');
      result.content = content;
      return result;
    }

    // Split frontmatter and content
    const parts = content.split('---');
    if (parts.length < 3) {
      logger.warn('Invalid SKILL.md format');
      result.content = content;
      return result;
    }

    const frontmatter = parts[1].trim();
    const markdownContent = parts.slice(2).join('---').trim();

    // Parse YAML frontmatter (simple parser)
    result.metadata = parseYamlFrontmatter(frontmatter);
    result.content = markdownContent;

    // Extract system prompt section
    result.systemPrompt = extractSection(markdownContent, 'System Prompt') ||
                          extractSection(markdownContent, 'system prompt') ||
                          extractCodeBlock(markdownContent);

    // Extract workflows
    result.workflows = extractWorkflows(markdownContent);

    // Extract Windmill scripts
    result.windmillScripts = extractWindmillScripts(markdownContent);

  } catch (error) {
    logger.error('Failed to parse SKILL.md', { error: (error as Error).message });
  }

  return result;
}

function parseYamlFrontmatter(yaml: string): SkillMetadata {
  const metadata: SkillMetadata = {
    name: 'Unknown',
    description: '',
    triggers: [],
  };

  const lines = yaml.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    // Handle array values
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1);
      const items = value.split(',').map(s => s.trim().replace(/['"]/g, ''));

      switch (key) {
        case 'triggers':
          metadata.triggers = items;
          break;
        case 'platforms':
          metadata.platforms = items;
          break;
      }
    } else {
      // Handle string/boolean/number values
      value = value.replace(/['"]/g, '');

      switch (key) {
        case 'name':
          metadata.name = value;
          break;
        case 'description':
          metadata.description = value;
          break;
        case 'requires_windmill':
          metadata.requires_windmill = value.toLowerCase() === 'true';
          break;
        case 'priority':
          metadata.priority = parseInt(value, 10);
          break;
        case 'version':
          metadata.version = value;
          break;
        case 'author':
          metadata.author = value;
          break;
      }
    }
  }

  // Handle multi-line triggers
  if (metadata.triggers.length === 0) {
    const triggersMatch = yaml.match(/triggers:\s*\n((?:\s+-\s+.+\n?)+)/);
    if (triggersMatch) {
      const triggerLines = triggersMatch[1].match(/-\s+(.+)/g);
      if (triggerLines) {
        metadata.triggers = triggerLines.map(line =>
          line.replace(/^-\s+/, '').replace(/['"]/g, '').trim()
        );
      }
    }
  }

  return metadata;
}

function extractSection(content: string, sectionName: string): string {
  const regex = new RegExp(`##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = content.match(regex);

  if (match) {
    return match[1].trim();
  }

  return '';
}

function extractCodeBlock(content: string): string {
  const match = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

function extractWorkflows(content: string): SkillWorkflow[] {
  const workflows: SkillWorkflow[] = [];

  // Find workflows section
  const workflowsSection = extractSection(content, 'Workflows');
  if (!workflowsSection) return workflows;

  // Parse each workflow (### workflow-name)
  const workflowMatches = workflowsSection.matchAll(/###\s+(\S+)\s*\n([\s\S]*?)(?=\n###|$)/g);

  for (const match of workflowMatches) {
    const name = match[1].trim();
    const body = match[2].trim();

    // Extract numbered steps
    const steps = body.match(/^\d+\.\s+.+$/gm) || [];
    workflows.push({
      name,
      steps: steps.map(s => s.replace(/^\d+\.\s+/, '').trim()),
    });
  }

  return workflows;
}

function extractWindmillScripts(content: string): string[] {
  const scripts: string[] = [];

  // Find Windmill Scripts section
  const scriptsSection = extractSection(content, 'Windmill Scripts');
  if (!scriptsSection) return scripts;

  // Extract script paths (- `path` or - path format)
  const scriptMatches = scriptsSection.matchAll(/-\s+`?([^`\n]+)`?\s*/g);

  for (const match of scriptMatches) {
    const script = match[1].trim().split(/\s+-\s+/)[0]; // Remove description after " - "
    if (script.includes('/')) {
      scripts.push(script);
    }
  }

  return scripts;
}

export default parseSkillMarkdown;
