import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import logger from '../utils/logger';
import { Skill, ISkill } from '../models/skill.model';

/**
 * Parsed skill structure from SKILL.md file
 */
export interface ParsedSkill {
    name: string;
    description: string;
    allowedTools: string[];
    content: string;
    path: string;
    type: 'personal' | 'project' | 'plugin';
}

/**
 * Matched skill with relevance score
 */
export interface MatchedSkill {
    skill: ParsedSkill;
    score: number;
}

/**
 * SkillService - Manages Agent Skills
 * 
 * Skills are SKILL.md files that teach the AI specific workflows.
 * They are stored in:
 * - Personal: ~/.claude/skills/
 * - Project: .claude/skills/
 */
class SkillService {
    private cachedSkills: Map<string, ParsedSkill[]> = new Map();
    private cacheTimeout = 60000; // 1 minute cache
    private lastCacheTime: Map<string, number> = new Map();

    /**
     * Get skill directories for a project
     */
    getSkillDirectories(projectPath: string): { path: string; type: 'personal' | 'project' }[] {
        const dirs: { path: string; type: 'personal' | 'project' }[] = [];

        // Personal skills: ~/.claude/skills/
        const personalDir = path.join(os.homedir(), '.claude', 'skills');
        if (fs.existsSync(personalDir)) {
            dirs.push({ path: personalDir, type: 'personal' });
        }

        // Project skills: .claude/skills/
        if (projectPath) {
            const projectDir = path.join(projectPath, '.claude', 'skills');
            if (fs.existsSync(projectDir)) {
                dirs.push({ path: projectDir, type: 'project' });
            }
        }

        return dirs;
    }

    /**
     * Load all skills from disk
     */
    async loadSkills(projectPath: string): Promise<ParsedSkill[]> {
        const cacheKey = projectPath || 'default';
        const now = Date.now();

        // Check cache
        if (this.cachedSkills.has(cacheKey) &&
            (now - (this.lastCacheTime.get(cacheKey) || 0)) < this.cacheTimeout) {
            return this.cachedSkills.get(cacheKey)!;
        }

        const skills: ParsedSkill[] = [];
        const skillDirs = this.getSkillDirectories(projectPath);

        for (const { path: dirPath, type } of skillDirs) {
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
                        if (fs.existsSync(skillMdPath)) {
                            try {
                                const skill = this.parseSkillFile(skillMdPath, type);
                                skills.push(skill);
                                logger.debug('Loaded skill', { name: skill.name, type });
                            } catch (error) {
                                logger.error('Failed to parse skill', {
                                    path: skillMdPath,
                                    error: (error as Error).message
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                logger.debug('Skill directory not accessible', {
                    path: dirPath,
                    error: (error as Error).message
                });
            }
        }

        // Update cache
        this.cachedSkills.set(cacheKey, skills);
        this.lastCacheTime.set(cacheKey, now);

        logger.info('Skills loaded', { count: skills.length, projectPath });
        return skills;
    }

    /**
     * Parse SKILL.md file with YAML frontmatter
     * 
     * Format:
     * ---
     * name: skill-name
     * description: Brief description
     * allowed-tools: Read, Grep, Glob
     * ---
     * # Skill Content
     * ...
     */
    parseSkillFile(filePath: string, type: 'personal' | 'project' | 'plugin'): ParsedSkill {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract YAML frontmatter
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            throw new Error('Invalid SKILL.md format: Missing YAML frontmatter');
        }

        const frontmatterStr = frontmatterMatch[1];
        const markdownContent = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

        // Parse YAML frontmatter manually (simple key: value parsing)
        const frontmatter: Record<string, string> = {};
        const lines = frontmatterStr.split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                frontmatter[key] = value;
            }
        }

        // Validate required fields
        if (!frontmatter.name) {
            throw new Error('Invalid SKILL.md: Missing required field "name"');
        }
        if (!frontmatter.description) {
            throw new Error('Invalid SKILL.md: Missing required field "description"');
        }

        // Parse allowed-tools (comma-separated)
        const allowedTools: string[] = [];
        if (frontmatter['allowed-tools']) {
            allowedTools.push(
                ...frontmatter['allowed-tools'].split(',').map(t => t.trim()).filter(Boolean)
            );
        }

        return {
            name: frontmatter.name,
            description: frontmatter.description,
            allowedTools,
            content: markdownContent.trim(),
            path: filePath,
            type,
        };
    }

    /**
     * Match skills to user prompt based on description relevance
     * Uses simple keyword matching with TF-IDF-like scoring
     */
    matchSkills(prompt: string, skills: ParsedSkill[], threshold = 0.2): MatchedSkill[] {
        const promptLower = prompt.toLowerCase();
        const promptWords = this.tokenize(promptLower);

        const matches: MatchedSkill[] = [];

        for (const skill of skills) {
            const descriptionLower = skill.description.toLowerCase();
            const nameLower = skill.name.toLowerCase().replace(/-/g, ' ');

            // Calculate relevance score
            let score = 0;

            // Check for name match (high weight)
            if (promptLower.includes(nameLower) || nameLower.split(' ').some(w => promptLower.includes(w))) {
                score += 0.5;
            }

            // Check for keyword overlap in description
            const descWords = this.tokenize(descriptionLower);
            const commonWords = promptWords.filter(w => descWords.includes(w) && w.length > 3);
            score += (commonWords.length / Math.max(promptWords.length, 1)) * 0.5;

            // Check for specific trigger words from description
            const triggerWords = this.extractTriggerWords(skill.description);
            for (const trigger of triggerWords) {
                if (promptLower.includes(trigger.toLowerCase())) {
                    score += 0.3;
                }
            }

            // Cap score at 1.0
            score = Math.min(score, 1.0);

            if (score >= threshold) {
                matches.push({ skill, score });
            }
        }

        // Sort by score descending
        return matches.sort((a, b) => b.score - a.score);
    }

    /**
     * Tokenize text into words
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);
    }

    /**
     * Extract trigger words from description
     * Looks for patterns like "Use when..." or action verbs
     */
    private extractTriggerWords(description: string): string[] {
        const triggers: string[] = [];

        // Extract "Use when..." patterns
        const useWhenMatch = description.match(/use when\s+([^.]+)/i);
        if (useWhenMatch) {
            triggers.push(...this.tokenize(useWhenMatch[1]));
        }

        // Extract action words
        const actionWords = ['generate', 'create', 'write', 'review', 'analyze',
            'extract', 'commit', 'test', 'debug', 'refactor',
            'document', 'deploy', 'build', 'format', 'lint'];
        for (const word of actionWords) {
            if (description.toLowerCase().includes(word)) {
                triggers.push(word);
            }
        }

        return triggers;
    }

    /**
     * Get skill by name
     */
    async getSkillByName(name: string, projectPath: string): Promise<ParsedSkill | null> {
        const skills = await this.loadSkills(projectPath);
        return skills.find(s => s.name === name) || null;
    }

    /**
     * Build skill context for system prompt
     * Returns the skill content to inject into the prompt
     */
    buildSkillContext(matchedSkills: MatchedSkill[]): string {
        if (matchedSkills.length === 0) {
            return '';
        }

        let context = `
## Active Skills

The following skills are available for this task. Follow their instructions when applicable:

`;

        for (const { skill, score: _score } of matchedSkills.slice(0, 3)) { // Max 3 skills
            context += `
### Skill: ${skill.name}
**Description:** ${skill.description}
${skill.allowedTools.length > 0 ? `**Allowed Tools:** ${skill.allowedTools.join(', ')}` : ''}

${skill.content}

---
`;
        }

        return context;
    }

    /**
     * Get tool restrictions from matched skills
     * If any skill specifies allowed-tools, return the intersection
     */
    getToolRestrictions(matchedSkills: MatchedSkill[]): string[] | null {
        const skillsWithRestrictions = matchedSkills.filter(m => m.skill.allowedTools.length > 0);

        if (skillsWithRestrictions.length === 0) {
            return null; // No restrictions
        }

        // Return union of all allowed tools from matched skills
        const allowedSet = new Set<string>();
        for (const { skill } of skillsWithRestrictions) {
            skill.allowedTools.forEach(t => allowedSet.add(t));
        }

        return Array.from(allowedSet);
    }

    /**
     * Save skill to database
     */
    async saveSkillToDb(skill: ParsedSkill): Promise<ISkill> {
        const existing = await Skill.findOne({ name: skill.name });

        if (existing) {
            existing.description = skill.description;
            existing.allowedTools = skill.allowedTools;
            existing.content = skill.content;
            existing.path = skill.path;
            existing.type = skill.type;
            await existing.save();
            return existing;
        }

        return Skill.create(skill);
    }

    /**
     * Get all skills from database
     */
    async getSkillsFromDb(): Promise<ISkill[]> {
        return Skill.find({ enabled: true }).sort({ name: 1 });
    }

    /**
     * Create skills directory structure
     */
    async createSkillDirectory(projectPath: string, skillName: string): Promise<string> {
        const skillDir = path.join(projectPath, '.claude', 'skills', skillName);

        if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
        }

        const skillMdPath = path.join(skillDir, 'SKILL.md');

        if (!fs.existsSync(skillMdPath)) {
            const template = `---
name: ${skillName}
description: Brief description of what this skill does and when to use it.
---
# ${skillName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## Instructions

Provide clear, step-by-step guidance for the AI.

## Examples

Show concrete examples of using this skill.
`;
            fs.writeFileSync(skillMdPath, template, 'utf-8');
        }

        return skillDir;
    }

    /**
     * Clear skill cache
     */
    clearCache(): void {
        this.cachedSkills.clear();
        this.lastCacheTime.clear();
    }
}

// Export singleton
export const skillService = new SkillService();
export default skillService;
