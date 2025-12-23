import { Router, Request, Response } from 'express';
import { skillService } from '../services/skill.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/skills
 * List all available skills
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const projectPath = (req.query.projectPath as string) || process.cwd();

        // Load skills from filesystem
        const skills = await skillService.loadSkills(projectPath);

        res.json({
            success: true,
            skills: skills.map(s => ({
                name: s.name,
                description: s.description,
                type: s.type,
                allowedTools: s.allowedTools,
                hasContent: s.content.length > 0,
            })),
            count: skills.length,
        });
    } catch (error) {
        logger.error('Failed to list skills', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

/**
 * GET /api/skills/:name
 * Get skill details by name
 */
router.get('/:name', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name } = req.params;
        const projectPath = (req.query.projectPath as string) || process.cwd();

        const skill = await skillService.getSkillByName(name, projectPath);

        if (!skill) {
            res.status(404).json({
                success: false,
                error: `Skill "${name}" not found`,
            });
            return;
        }

        res.json({
            success: true,
            skill: {
                name: skill.name,
                description: skill.description,
                allowedTools: skill.allowedTools,
                content: skill.content,
                path: skill.path,
                type: skill.type,
            },
        });
    } catch (error) {
        logger.error('Failed to get skill', { name: req.params.name, error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

/**
 * POST /api/skills/match
 * Match skills to a prompt
 */
router.post('/match', async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt, projectPath } = req.body;

        if (!prompt) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: prompt',
            });
            return;
        }

        const path = projectPath || process.cwd();
        const skills = await skillService.loadSkills(path);
        const matches = skillService.matchSkills(prompt, skills);

        res.json({
            success: true,
            matches: matches.map(m => ({
                name: m.skill.name,
                description: m.skill.description,
                score: Math.round(m.score * 100) / 100,
                allowedTools: m.skill.allowedTools,
            })),
            count: matches.length,
        });
    } catch (error) {
        logger.error('Failed to match skills', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

/**
 * POST /api/skills
 * Create a new skill
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, description, content, allowedTools, projectPath } = req.body;

        if (!name || !description) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: name, description',
            });
            return;
        }

        // Validate name format
        if (!/^[a-z0-9-]+$/.test(name) || name.length > 64) {
            res.status(400).json({
                success: false,
                error: 'Invalid name: must be lowercase letters, numbers, and hyphens only (max 64 chars)',
            });
            return;
        }

        const path = projectPath || process.cwd();

        // Create skill directory and file
        const skillDir = await skillService.createSkillDirectory(path, name);

        // If content provided, update SKILL.md
        if (content) {
            const fs = await import('fs');
            const skillMdPath = `${skillDir}/SKILL.md`;

            const frontmatter = `---
name: ${name}
description: ${description}
${allowedTools?.length ? `allowed-tools: ${allowedTools.join(', ')}` : ''}
---
`;
            fs.writeFileSync(skillMdPath, frontmatter + content, 'utf-8');
        }

        // Clear cache to reload skills
        skillService.clearCache();

        res.json({
            success: true,
            message: `Skill "${name}" created at ${skillDir}`,
            path: skillDir,
        });
    } catch (error) {
        logger.error('Failed to create skill', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

/**
 * DELETE /api/skills/:name
 * Delete a skill
 */
router.delete('/:name', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name } = req.params;
        const projectPath = (req.query.projectPath as string) || process.cwd();

        const skill = await skillService.getSkillByName(name, projectPath);

        if (!skill) {
            res.status(404).json({
                success: false,
                error: `Skill "${name}" not found`,
            });
            return;
        }

        // Delete from filesystem
        const fs = await import('fs');
        const skillDir = skill.path.replace('/SKILL.md', '').replace('\\SKILL.md', '');

        if (fs.existsSync(skillDir)) {
            fs.rmSync(skillDir, { recursive: true, force: true });
        }

        // Clear cache
        skillService.clearCache();

        res.json({
            success: true,
            message: `Skill "${name}" deleted`,
        });
    } catch (error) {
        logger.error('Failed to delete skill', { name: req.params.name, error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

export default router;
