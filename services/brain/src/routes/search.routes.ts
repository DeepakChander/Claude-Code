import { Router, Request, Response } from 'express';
import { tavilyService } from '../services/tavily.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/search/status
 * Check if search is configured
 */
router.get('/status', (_req: Request, res: Response) => {
    res.json({
        success: true,
        configured: tavilyService.isConfigured(),
        provider: 'tavily',
    });
});

/**
 * POST /api/search
 * Perform a web search
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, maxResults, searchDepth } = req.body;

        if (!query) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: query',
            });
            return;
        }

        if (!tavilyService.isConfigured()) {
            res.status(503).json({
                success: false,
                error: 'Search service not configured. Set TAVILY_API_KEY in environment.',
            });
            return;
        }

        const response = await tavilyService.search(query, {
            maxResults: maxResults || 5,
            searchDepth: searchDepth || 'basic',
            includeAnswer: true,
        });

        res.json({
            success: true,
            query: response.query,
            answer: response.answer,
            results: response.results,
            count: response.results.length,
        });

    } catch (error) {
        logger.error('Search request failed', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

/**
 * POST /api/search/research
 * Research a topic for best practices and recommendations
 */
router.post('/research', async (req: Request, res: Response): Promise<void> => {
    try {
        const { topic, context } = req.body;

        if (!topic) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: topic',
            });
            return;
        }

        if (!tavilyService.isConfigured()) {
            res.status(503).json({
                success: false,
                error: 'Search service not configured. Set TAVILY_API_KEY in environment.',
            });
            return;
        }

        const research = await tavilyService.researchTopic(topic, context);

        res.json({
            success: true,
            topic,
            findings: research.findings,
            recommendations: research.recommendations,
            sources: research.sources,
        });

    } catch (error) {
        logger.error('Research request failed', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        });
    }
});

export default router;
