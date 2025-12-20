import { Router } from 'express';
import authRoutes from './auth.routes';
import agentRoutes from './agent.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/agent', agentRoutes);

export default router;
