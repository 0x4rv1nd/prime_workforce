import { Router } from 'express';
import { Job } from '../models/Job.js';

const router = Router();

/**
 * @swagger
 * /public/jobs:
 *   get:
 *     summary: Get public jobs for landing page
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: List of public jobs
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const jobs = await Job.find({ status: 'OPEN' })
      .populate('clientId', 'companyName')
      .sort({ createdAt: -1 })
      .limit(6);

    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    next(error);
  }
});

export default router;
