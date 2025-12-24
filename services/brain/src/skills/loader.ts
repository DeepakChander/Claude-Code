// Skill Loader
// Loads and manages SKILL.md files from the skills directory

import * as fs from 'fs';
import * as path from 'path';
import { SkillDefinition } from './types';
import { parseSkillMarkdown } from './parser';
import logger from '../utils/logger';

class SkillLoader {
  private skillsDir: string;
  private skills: Map<string, SkillDefinition> = new Map();
  private loaded: boolean = false;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.join(process.cwd(), 'skills');
  }

  async loadAll(): Promise<Map<string, SkillDefinition>> {
    if (this.loaded) {
      return this.skills;
    }

    logger.info('Loading skills from directory', { path: this.skillsDir });

    try {
      // Check if directory exists
      if (!fs.existsSync(this.skillsDir)) {
        logger.warn('Skills directory does not exist, creating...', { path: this.skillsDir });
        fs.mkdirSync(this.skillsDir, { recursive: true });
        return this.skills;
      }

      // Read all subdirectories
      const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadSkill(entry.name);
        }
      }

      this.loaded = true;
      logger.info('Skills loaded successfully', { count: this.skills.size });

    } catch (error) {
      logger.error('Failed to load skills', { error: (error as Error).message });
    }

    return this.skills;
  }

  private async loadSkill(skillName: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, skillName);
    const skillFile = path.join(skillDir, 'SKILL.md');

    try {
      if (!fs.existsSync(skillFile)) {
        logger.warn('SKILL.md not found', { skill: skillName });
        return;
      }

      const content = fs.readFileSync(skillFile, 'utf-8');
      const parsed = parseSkillMarkdown(content);

      const skill: SkillDefinition = {
        metadata: parsed.metadata,
        systemPrompt: parsed.systemPrompt,
        workflows: parsed.workflows,
        windmillScripts: parsed.windmillScripts,
        content: parsed.content,
        path: skillDir,
      };

      this.skills.set(skillName.toUpperCase(), skill);
      logger.debug('Skill loaded', {
        name: skill.metadata.name,
        triggers: skill.metadata.triggers.length,
        workflows: skill.workflows.length,
      });

    } catch (error) {
      logger.error('Failed to load skill', {
        skill: skillName,
        error: (error as Error).message,
      });
    }
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name.toUpperCase());
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  async reload(): Promise<void> {
    this.skills.clear();
    this.loaded = false;
    await this.loadAll();
  }

  // Load skill context for a specific skill
  async loadContext(skillName: string): Promise<{
    systemPrompt: string;
    workflows: SkillDefinition['workflows'];
    windmillScripts: string[];
  } | null> {
    const skill = this.getSkill(skillName);
    if (!skill) {
      return null;
    }

    return {
      systemPrompt: skill.systemPrompt,
      workflows: skill.workflows,
      windmillScripts: skill.windmillScripts,
    };
  }
}

// Singleton instance
export const skillLoader = new SkillLoader();

export default SkillLoader;
