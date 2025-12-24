// Skill Registry
// Routes user requests to appropriate skills based on triggers

import { SkillDefinition, SkillMatch } from './types';
import { skillLoader } from './loader';
import logger from '../utils/logger';

class SkillRegistry {
  private triggerMap: Map<string, SkillDefinition[]> = new Map();
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const skills = await skillLoader.loadAll();

    // Build trigger map
    for (const skill of skills.values()) {
      for (const trigger of skill.metadata.triggers) {
        const normalizedTrigger = trigger.toLowerCase();

        if (!this.triggerMap.has(normalizedTrigger)) {
          this.triggerMap.set(normalizedTrigger, []);
        }
        this.triggerMap.get(normalizedTrigger)!.push(skill);
      }
    }

    this.initialized = true;
    logger.info('Skill registry initialized', {
      skills: skills.size,
      triggers: this.triggerMap.size,
    });
  }

  // Match a user request to the best skill
  match(userRequest: string): SkillMatch | null {
    const requestLower = userRequest.toLowerCase();
    const words = requestLower.split(/\s+/);

    const matches: Map<SkillDefinition, { score: number; triggers: string[] }> = new Map();

    // Check each word against triggers
    for (const word of words) {
      // Direct trigger match
      if (this.triggerMap.has(word)) {
        for (const skill of this.triggerMap.get(word)!) {
          if (!matches.has(skill)) {
            matches.set(skill, { score: 0, triggers: [] });
          }
          const match = matches.get(skill)!;
          match.score += 1;
          if (!match.triggers.includes(word)) {
            match.triggers.push(word);
          }
        }
      }
    }

    // Check for phrase triggers
    for (const [trigger, skills] of this.triggerMap) {
      if (trigger.includes(' ') && requestLower.includes(trigger)) {
        for (const skill of skills) {
          if (!matches.has(skill)) {
            matches.set(skill, { score: 0, triggers: [] });
          }
          const match = matches.get(skill)!;
          match.score += 2; // Phrase matches worth more
          if (!match.triggers.includes(trigger)) {
            match.triggers.push(trigger);
          }
        }
      }
    }

    if (matches.size === 0) {
      // Default to CORE skill if no matches
      const coreSkill = skillLoader.getSkill('CORE');
      if (coreSkill) {
        return {
          skill: coreSkill,
          confidence: 0.3,
          matchedTriggers: ['default'],
        };
      }
      return null;
    }

    // Find best match (highest score, then priority)
    let bestMatch: SkillMatch | null = null;
    let bestScore = 0;

    for (const [skill, data] of matches) {
      const priority = skill.metadata.priority || 5;
      const adjustedScore = data.score + (10 - priority) * 0.1;

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestMatch = {
          skill,
          confidence: Math.min(adjustedScore / 5, 1), // Normalize to 0-1
          matchedTriggers: data.triggers,
        };
      }
    }

    if (bestMatch) {
      logger.debug('Skill matched', {
        skill: bestMatch.skill.metadata.name,
        confidence: bestMatch.confidence,
        triggers: bestMatch.matchedTriggers,
      });
    }

    return bestMatch;
  }

  // Get all available skills
  getAllSkills(): SkillDefinition[] {
    return skillLoader.getAllSkills();
  }

  // Find skills by capability
  findByCapability(capability: string): SkillDefinition[] {
    const capLower = capability.toLowerCase();
    return skillLoader.getAllSkills().filter(skill =>
      skill.metadata.description.toLowerCase().includes(capLower) ||
      skill.content.toLowerCase().includes(capLower)
    );
  }

  // Register a new trigger for a skill
  registerTrigger(trigger: string, skill: SkillDefinition): void {
    const normalizedTrigger = trigger.toLowerCase();

    if (!this.triggerMap.has(normalizedTrigger)) {
      this.triggerMap.set(normalizedTrigger, []);
    }
    this.triggerMap.get(normalizedTrigger)!.push(skill);

    logger.debug('Trigger registered', { trigger, skill: skill.metadata.name });
  }

  // Get skill by name
  getSkill(name: string): SkillDefinition | undefined {
    return skillLoader.getSkill(name);
  }
}

// Singleton instance
export const skillRegistry = new SkillRegistry();

export default SkillRegistry;
