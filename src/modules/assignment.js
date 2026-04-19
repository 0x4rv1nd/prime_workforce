import { Router } from 'express';
import { Assignment } from '../models/Assignment.js';
import { Job } from '../models/Job.js';
import { User } from '../models/User.js';
import { Availability } from '../models/Availability.js';
import { auth, authorize } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';
import { getSocketManager } from '../utils/socket.js';

const router = Router();

async function checkWorkerAvailability(workerId, jobStartDate, jobEndDate) {
  const availabilities = await Availability.find({
    userId: workerId,
    date: { $gte: jobStartDate, $lte: jobEndDate },
    isAvailable: false
  });
  return availabilities.length === 0;
}

/**
 * @swagger
 * /assign:
 *   post:
 *     summary: Assign workers to a job
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, jobId]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               jobId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Workers assigned
 *       400:
 *         description: Validation error or job not found
 */
router.post('/', auth, authorize('ADMIN', 'SUPER_ADMIN'), validate(schemas.assignWorker), async (req, res, next) => {
  try {
    const { userIds, jobId } = req.body;

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
    
    const unavailableWorkers = [];
    const availableWorkers = [];
    
    for (const worker of validWorkers) {
      if (existingUserIds.includes(worker._id.toString())) {
        continue;
      }
      const isAvailable = await checkWorkerAvailability(worker._id, job.startDate, job.endDate);
      if (!isAvailable) {
        unavailableWorkers.push(worker.name);
      } else {
        availableWorkers.push(worker);
      }
    }

    if (unavailableWorkers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Workers not available during job dates: ${unavailableWorkers.join(', ')}` 
      });
    }

    const newAssignments = availableWorkers.map(worker => ({
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

    const socketManager = getSocketManager();
    if (socketManager) {
      const eventData = {
        type: 'ASSIGNMENT_CREATED',
        jobId,
        jobTitle: job.title,
        clientName: job.clientId?.name,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'assignment:created', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'assignment:created', eventData);

      for (const worker of availableWorkers) {
        await socketManager.sendNotification(
          worker._id,
          'New Assignment',
          `You have been assigned to ${job.title}`,
          'ASSIGNMENT',
          eventData
        );
      }
    }

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
 * /assign:
 *   get:
 *     summary: Get all assignments
 *     tags: [Assignments]
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
router.get('/', auth, async (req, res, next) => {
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

/**
 * @swagger
 * /assign/{id}:
 *   get:
 *     summary: Get assignment by ID
 *     tags: [Assignments]
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
 *         description: Assignment details
 *       404:
 *         description: Assignment not found
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('jobId', 'title description status location startDate endDate wage')
      .populate('assignedBy', 'name');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (req.user.role === 'WORKER' && assignment.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /assign/{id}:
 *   put:
 *     summary: Update assignment status
 *     tags: [Assignments]
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
 *             required: [status]
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
router.put('/:id', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const assignment = await Assignment.findById(req.params.id);
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

    const socketManager = getSocketManager();
    if (socketManager) {
      const updatedAssignment = await Assignment.findById(req.params.id).populate('userId', 'name');
      const updatedJob = await Job.findById(updatedAssignment.jobId);
      
      const eventData = {
        type: 'ASSIGNMENT_UPDATED',
        assignmentId: assignment._id,
        jobId: updatedAssignment.jobId,
        jobTitle: updatedJob?.title,
        status,
        workerName: updatedAssignment.userId?.name,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'assignment:updated', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'assignment:updated', eventData);
      socketManager.emitToUser(updatedAssignment.userId._id, 'assignment:updated', eventData);
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /assign/{id}:
 *   delete:
 *     summary: Remove assignment
 *     tags: [Assignments]
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
 *         description: Assignment removed
 *       404:
 *         description: Assignment not found
 */
router.delete('/:id', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ASSIGNMENT_REMOVED',
      entityType: 'Assignment',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'Assignment removed successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /assign/job/{jobId}:
 *   get:
 *     summary: Get workers assigned to a job
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of assigned workers
 */
router.get('/job/:jobId', auth, async (req, res, next) => {
  try {
    const assignments = await Assignment.find({ jobId: req.params.jobId })
      .populate('userId', 'name email phone')
      .sort({ assignedAt: -1 });

    res.json({ success: true, data: assignments });
  } catch (error) {
    next(error);
  }
});

export default router;