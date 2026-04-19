import { Router } from 'express';
import authRoutes from './v1/auth.js';
import adminRoutes from './v1/admin.js';
import clientRoutes from './v1/client.js';
import promoterRoutes from './v1/promoter.js';
import reportsRoutes from './reports.js';
import notificationRoutes from './notification.js';
import publicRoutes from './public.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/client', clientRoutes);
router.use('/promoter', promoterRoutes);
router.use('/reports', reportsRoutes);
router.use('/notifications', notificationRoutes);

export default router;