import { Router } from 'express';
import { User } from '../../models/User.js';
import { Client } from '../../models/Client.js';
import { Job } from '../../models/Job.js';
import { Assignment } from '../../models/Assignment.js';
import { Attendance } from '../../models/Attendance.js';
import { hashPassword, comparePassword } from '../../utils/auth.js';
import { auth, authorize } from '../../middlewares/auth.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { validate, schemas } from '../../middlewares/validation.js';

const router = Router();

router.use(auth, authorize('SUPER_ADMIN', 'ADMIN'));

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: isApproved
 *         schema:
 *           type: boolean
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
 *         description: List of users
 */
router.get('/users', async (req, res, next) => {
  try {
    const { role, isApproved, page = 1, limit = 20 } = req.query;
    const filter = {};
    
    if (role) filter.role = role;
    if (isApproved !== undefined) filter.isApproved = isApproved === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: users,
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
 * /admin/users/:id:
 *   get:
 *     summary: Get specific user
 *     tags: [Admin - Users]
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
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/:id/approve:
 *   patch:
 *     summary: Approve worker
 *     tags: [Admin - Users]
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
 *         description: Worker approved
 *       404:
 *         description: User not found
 */
router.patch('/users/:id/approve', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isApproved = true;
    await user.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'WORKER_APPROVED',
      entityType: 'User',
      entityId: user._id
    });

    res.json({
      success: true,
      message: 'Worker approved successfully',
      data: { id: user._id, isApproved: user.isApproved }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/:id/reject:
 *   patch:
 *     summary: Reject worker
 *     tags: [Admin - Users]
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
 *         description: Worker rejected
 *       404:
 *         description: User not found
 */
router.patch('/users/:id/reject', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isApproved = false;
    await user.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'WORKER_REJECTED',
      entityType: 'User',
      entityId: user._id
    });

    res.json({
      success: true,
      message: 'Worker rejected',
      data: { id: user._id, isApproved: user.isApproved }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/:id:
 *   delete:
 *     summary: Delete user
 *     tags: [Admin - Users]
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
 *         description: User deleted
 *       404:
 *         description: User not found
 */
router.delete('/users/:id', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============ CLIENTS ============

/**
 * @swagger
 * /admin/clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Admin - Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, companyName]
 *     responses:
 *       201:
 *         description: Client created
 */
router.post('/clients', validate(schemas.createClient), async (req, res, next) => {
  try {
    const { name, email, password, companyName, contactPhone, companyAddress, industry } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'CLIENT',
      isApproved: true
    });

    const client = await Client.create({
      userId: user._id,
      companyName,
      contactEmail: email.toLowerCase(),
      contactPhone,
      companyAddress,
      industry
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'CLIENT_CREATED',
      entityType: 'Client',
      entityId: client._id
    });

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: {
        user: { id: user._id, name: user.name, email: user.email },
        client: { id: client._id, companyName: client.companyName }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Admin - Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clients
 */
router.get('/clients', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const clients = await Client.find()
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Client.countDocuments();

    res.json({
      success: true,
      data: clients,
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
 * /admin/clients/:id:
 *   get:
 *     summary: Get client by ID
 *     tags: [Admin - Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client details
 */
router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).populate('userId', 'name email phone');
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    res.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
});

// ============ JOBS ============

/**
 * @swagger
 * /admin/jobs:
 *   get:
 *     summary: Get all jobs
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of jobs
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    
    if (status) filter.status = status;

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
 * /admin/jobs/:id:
 *   get:
 *     summary: Get job by ID
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job details
 */
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id).populate('clientId', 'companyName');
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

// ============ ASSIGNMENTS ============

/**
 * @swagger
 * /admin/assignments:
 *   post:
 *     summary: Assign workers to a job
 *     tags: [Admin - Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, jobId]
 *     responses:
 *       201:
 *         description: Workers assigned
 */
router.post('/assignments', validate(schemas.assignWorker), async (req, res, next) => {
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
      details: { assignedCount: newAssignments.length }
    });

    res.status(201).json({
      success: true,
      message: `${newAssignments.length} worker(s) assigned successfully`,
      data: { assigned: newAssignments.length }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/assignments:
 *   get:
 *     summary: Get all assignments
 *     tags: [Admin - Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assignments
 */
router.get('/assignments', async (req, res, next) => {
  try {
    const { jobId, userId, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (jobId) filter.jobId = jobId;
    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const assignments = await Assignment.find(filter)
      .populate('userId', 'name email')
      .populate('jobId', 'title status')
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

// ============ REPORTS ============

/**
 * @swagger
 * /admin/reports/daily:
 *   get:
 *     summary: Get daily report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily report
 */
router.get('/reports/daily', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({
      date: { $gte: today }
    }).populate('userId', 'name').populate('jobId', 'title');

    const totalCheckIns = attendance.filter(a => a.checkIn?.time).length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);

    res.json({
      success: true,
      data: {
        date: today,
        totalCheckIns,
        totalHours,
        records: attendance
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/reports/weekly:
 *   get:
 *     summary: Get weekly report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weekly report
 */
router.get('/reports/weekly', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const attendance = await Attendance.find({
      date: { $gte: weekAgo }
    }).populate('userId', 'name').populate('jobId', 'title');

    const totalCheckIns = attendance.filter(a => a.checkIn?.time).length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);

    res.json({
      success: true,
      data: {
        from: weekAgo,
        to: today,
        totalCheckIns,
        totalHours,
        records: attendance
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/reports/monthly:
 *   get:
 *     summary: Get monthly report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly report
 */
router.get('/reports/monthly', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const attendance = await Attendance.find({
      date: { $gte: monthAgo }
    }).populate('userId', 'name').populate('jobId', 'title');

    const totalCheckIns = attendance.filter(a => a.checkIn?.time).length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);

    res.json({
      success: true,
      data: {
        from: monthAgo,
        to: today,
        totalCheckIns,
        totalHours,
        records: attendance
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;