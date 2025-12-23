import { Router } from 'express';
import authRoutes from './auth.routes';
import agentRoutes from './agent.routes';
import pendingResponseRoutes from './pending-response.routes';
import skillsRoutes from './skills.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/agent', agentRoutes);
router.use('/pending-responses', pendingResponseRoutes);
router.use('/skills', skillsRoutes);

export default router;
