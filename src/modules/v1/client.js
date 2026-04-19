import { Router } from 'express';
import { Job } from '../../models/Job.js';
import { Client } from '../../models/Client.js';
import { Assignment } from '../../models/Assignment.js';
import { Attendance } from '../../models/Attendance.js';
import { auth, authorize } from '../../middlewares/auth.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { validate, schemas } from '../../middlewares/validation.js';

const router = Router();

router.use(auth, authorize('CLIENT'));

/**
 * @swagger
 * /client/profile:
 *   get:
 *     summary: Get client profile
 *     tags: [Client - Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client profile
 */
router.get('/profile', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id }).populate('userId', 'name email phone');
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client profile not found' });
    }

    res.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs:
 *   post:
 *     summary: Create a new job
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *     responses:
 *       201:
 *         description: Job created
 */
router.post('/jobs', validate(schemas.createJob), async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client profile not found' });
    }

    const { startDate, endDate } = req.body;

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const job = await Job.create({
      ...req.body,
      clientId: client._id,
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_CREATED',
      entityType: 'Job',
      entityId: job._id
    });

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs:
 *   get:
 *     summary: Get client jobs
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of jobs
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const filter = { clientId: client._id };
    
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Job.countDocuments(filter);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs/:id:
 *   get:
 *     summary: Get job by ID
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job details
 */
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client profile not found' });
    }

    const job = await Job.findOne({ _id: req.params.id, clientId: client._id });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs/:id:
 *   put:
 *     summary: Update job
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job updated
 */
router.put('/jobs/:id', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client profile not found' });
    }

    const job = await Job.findOne({ _id: req.params.id, clientId: client._id });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const allowedFields = ['title', 'description', 'status', 'wage', 'requiredWorkers', 'skills', 'location'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_UPDATED',
      entityType: 'Job',
      entityId: req.params.id,
      details: updates
    });

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs/:id:
 *   delete:
 *     summary: Delete job
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job deleted
 */
router.delete('/jobs/:id', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client profile not found' });
    }

    const job = await Job.findOneAndDelete({ _id: req.params.id, clientId: client._id });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_DELETED',
      entityType: 'Job',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/promoters:
 *   get:
 *     summary: Get promoters for client jobs
 *     tags: [Client - Workers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of promoters
 */
router.get('/promoters', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const jobs = await Job.find({ clientId: client._id }).select('_id');
    const jobIds = jobs.map(j => j._id);

    const assignments = await Assignment.find({ jobId: { $in: jobIds } })
      .populate('userId', 'name email phone')
      .populate('jobId', 'title');

    const promoters = assignments.map(a => ({
      ...a.userId.toObject(),
      job: a.jobId,
      assignmentStatus: a.status,
      assignedAt: a.assignedAt
    }));

    res.json({ success: true, data: promoters });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/attendance:
 *   get:
 *     summary: Get attendance for client jobs
 *     tags: [Client - Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Attendance records
 */
router.get('/attendance', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const jobs = await Job.find({ clientId: client._id }).select('_id');
    const jobIds = jobs.map(j => j._id);

    const { date } = req.query;
    const filter = { jobId: { $in: jobIds } };
    
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      filter.date = { $gte: targetDate, $lt: nextDate };
    }

    const attendance = await Attendance.find(filter)
      .populate('userId', 'name email')
      .populate('jobId', 'title')
      .sort({ date: -1 });

    res.json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/attendance/:userId:
 *   get:
 *     summary: Get attendance for specific promoter
 *     tags: [Client - Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Attendance records
 */
router.get('/attendance/:userId', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const jobs = await Job.find({ clientId: client._id }).select('_id');
    const jobIds = jobs.map(j => j._id);

    const attendance = await Attendance.find({
      jobId: { $in: jobIds },
      userId: req.params.userId
    })
      .populate('userId', 'name email')
      .populate('jobId', 'title')
      .sort({ date: -1 });

    res.json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
});

export default router;