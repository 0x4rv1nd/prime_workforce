import { Router } from 'express';
import { Job } from '../models/Job.js';
import { Client } from '../models/Client.js';
import { Assignment } from '../models/Assignment.js';
import { User } from '../models/User.js';
import { auth, authorize } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';
import { getSocketManager } from '../utils/socket.js';

const router = Router();

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new job (Admin or Client)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - location
 *               - startDate
 *               - endDate
 *               - clientId
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   address:
 *                     type: string
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *                   radius:
 *                     type: number
 *               clientId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               wage:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                   currency:
 *                     type: string
 *                   type:
 *                     type: string
 *               requiredWorkers:
 *                 type: integer
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Job created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Client not found
 */
router.post('/', auth, authorize('ADMIN', 'CLIENT'), validate(schemas.createJob), async (req, res, next) => {
  try {
    const { clientId, startDate, endDate } = req.body;

    if (req.user.role === 'CLIENT') {
      const client = await Client.findOne({ userId: req.user._id });
      if (!client || client._id.toString() !== clientId) {
        return res.status(403).json({ success: false, message: 'Can only create jobs for your own company' });
      }
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const job = await Job.create({
      ...req.body,
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_CREATED',
      entityType: 'Job',
      entityId: job._id,
      details: { title: job.title, clientId }
    });

    const socketManager = getSocketManager();
    if (socketManager) {
      const eventData = {
        type: 'JOB_CREATED',
        jobId: job._id,
        title: job.title,
        description: job.description,
        startDate: job.startDate,
        endDate: job.endDate,
        status: job.status,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'job:created', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'job:created', eventData);
      socketManager.emitToRole('WORKER', 'job:created', eventData);
    }

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
 * /jobs:
 *   get:
 *     summary: Get all jobs
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, COMPLETED, CANCELLED]
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of jobs
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, clientId, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (clientId) filter.clientId = clientId;

    if (req.user.role === 'CLIENT') {
      const client = await Client.findOne({ userId: req.user._id });
      if (client) {
        filter.clientId = client._id;
      } else {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(filter)
      .populate('clientId', 'companyName')
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
 * /jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job details
 *       404:
 *         description: Job not found
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id).populate('clientId', 'companyName contactEmail');
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (req.user.role === 'CLIENT') {
      const client = await Client.findOne({ userId: req.user._id });
      if (!client || client._id.toString() !== job.clientId._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/{id}:
 *   put:
 *     summary: Update job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               wage:
 *                 type: object
 *     responses:
 *       200:
 *         description: Job updated
 *       404:
 *         description: Job not found
 */
router.put('/:id', auth, authorize('ADMIN', 'CLIENT'), async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (req.user.role === 'CLIENT') {
      const client = await Client.findOne({ userId: req.user._id });
      if (!client || client._id.toString() !== job.clientId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
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
    ).populate('clientId', 'companyName');

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_UPDATED',
      entityType: 'Job',
      entityId: req.params.id,
      details: updates
    });

    const socketManager = getSocketManager();
    if (socketManager) {
      const eventData = {
        type: 'JOB_UPDATED',
        jobId: req.params.id,
        updates,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'job:updated', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'job:updated', eventData);
      socketManager.emitToRole('CLIENT', 'job:updated', eventData);
      socketManager.emitToRole('WORKER', 'job:updated', eventData);
    }

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/{id}:
 *   delete:
 *     summary: Delete job (Admin only)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job deleted
 *       404:
 *         description: Job not found
 */
router.delete('/:id', auth, authorize('ADMIN'), async (req, res, next) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
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
 * /jobs/{id}/assign:
 *   post:
 *     summary: Assign workers to a job
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Workers assigned to job
 *       400:
 *         description: Job not found or cannot assign
 */
router.post('/:id/assign', auth, authorize('ADMIN', 'SUPER_ADMIN'), validate(schemas.assignWorker), async (req, res, next) => {
  try {
    const { userIds } = req.body;
    const jobId = req.params.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot assign to a completed or cancelled job' });
    }

    const validWorkers = await User.find({
      _id: { $in: userIds },
      role: 'WORKER',
      isApproved: true
    });

    if (validWorkers.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid approved workers found' });
    }

    const existingAssignments = await Assignment.find({
      userId: { $in: validWorkers.map(w => w._id) },
      jobId
    });

    const existingUserIds = existingAssignments.map(a => a.userId.toString());
    const newAssignments = validWorkers
      .filter(w => !existingUserIds.includes(w._id.toString()))
      .map(worker => ({
        userId: worker._id,
        jobId,
        assignedBy: req.user._id,
        status: 'PENDING'
      }));

    if (newAssignments.length > 0) {
      await Assignment.insertMany(newAssignments);
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'WORKERS_ASSIGNED',
      entityType: 'Job',
      entityId: jobId,
      details: { assignedCount: newAssignments.length, workerIds: validWorkers.map(w => w._id) }
    });

    res.status(201).json({
      success: true,
      message: `${newAssignments.length} worker(s) assigned successfully`,
      data: {
        assigned: newAssignments.length,
        alreadyAssigned: existingUserIds.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/{id}/workers:
 *   get:
 *     summary: Get workers assigned to a job
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of assigned workers
 */
router.get('/:id/workers', auth, async (req, res, next) => {
  try {
    const assignments = await Assignment.find({ jobId: req.params.id })
      .populate('userId', 'name email phone')
      .sort({ assignedAt: -1 });

    res.json({ success: true, data: assignments });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/{id}/assignments:
 *   get:
 *     summary: Get all assignments for a job
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, COMPLETED, CANCELLED]
 *     responses:
 *       200:
 *         description: List of assignments
 */
router.get('/:id/assignments', auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { jobId: req.params.id };
    if (status) filter.status = status;

    const assignments = await Assignment.find(filter)
      .populate('userId', 'name email')
      .populate('assignedBy', 'name')
      .sort({ assignedAt: -1 });

    res.json({ success: true, data: assignments });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/assignments/{assignmentId}:
 *   put:
 *     summary: Update assignment status
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, ACTIVE, COMPLETED, CANCELLED]
 *     responses:
 *       200:
 *         description: Assignment updated
 *       404:
 *         description: Assignment not found
 */
router.put('/assignments/:assignmentId', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    assignment.status = status;
    if (status === 'ACTIVE' && !assignment.startedAt) {
      assignment.startedAt = new Date();
    }
    if (status === 'COMPLETED' && !assignment.completedAt) {
      assignment.completedAt = new Date();
    }

    await assignment.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ASSIGNMENT_STATUS_UPDATED',
      entityType: 'Assignment',
      entityId: assignment._id,
      details: { status }
    });

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/assignments/{assignmentId}:
 *   delete:
 *     summary: Remove assignment
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignment removed
 *       404:
 *         description: Assignment not found
 */
router.delete('/assignments/:assignmentId', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ASSIGNMENT_REMOVED',
      entityType: 'Assignment',
      entityId: req.params.assignmentId
    });

    res.json({ success: true, message: 'Assignment removed successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /jobs/assignments:
 *   get:
 *     summary: Get all assignments
 *     tags: [Jobs - Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: jobId
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of assignments
 */
router.get('/assignments', auth, async (req, res, next) => {
  try {
    const { jobId, userId, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (jobId) filter.jobId = jobId;
    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    if (req.user.role === 'WORKER') {
      filter.userId = req.user._id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const assignments = await Assignment.find(filter)
      .populate('userId', 'name email')
      .populate('jobId', 'title status location')
      .populate('assignedBy', 'name')
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Assignment.countDocuments(filter);

    res.json({
      success: true,
      data: assignments,
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

export default router;