import { Router } from 'express';
import authRoutes from './v1/auth.js';
import adminRoutes from './v1/admin.js';
import clientRoutes from './v1/client.js';
import workerRoutes from './v1/worker.js';
import reportsRoutes from './reports.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/client', clientRoutes);
router.use('/worker', workerRoutes);
router.use('/reports', reportsRoutes);

export default router;