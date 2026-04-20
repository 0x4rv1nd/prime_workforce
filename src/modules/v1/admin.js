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
 * /admin/stats:
 *   get:
 *     summary: Get system-wide statistics (Super Admin)
 *     tags: [Admin - Stats]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const clientFilter = { isDeleted: false };
    const jobFilter = { isDeleted: false };
    const userFilter = { role: 'PROMOTER', isDeleted: false };
    const approvalFilter = { role: 'PROMOTER', isApproved: false, isDeleted: false };
    const attendanceFilter = {};

    if (!isSuperAdmin) {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      
      clientFilter._id = { $in: clientIds };
      jobFilter.clientId = { $in: clientIds };
      
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      
      const assignments = await Assignment.find({ jobId: { $in: jobIds } }).select('userId');
      const assignedUserIds = [...new Set(assignments.map(a => a.userId.toString()))];
      
      userFilter._id = { $in: assignedUserIds };
      approvalFilter._id = { $in: assignedUserIds };
      attendanceFilter.jobId = { $in: jobIds };
    }

    const [
      totalUsers,
      totalAdmins,
      totalWorkers,
      totalClients,
      activeJobs,
      pendingApprovals,
      clockedIn,
      totalWorkersInJobs
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] }, isDeleted: false }),
      User.countDocuments(userFilter),
      Client.countDocuments(clientFilter),
      Job.countDocuments({ ...jobFilter, status: { $in: ['OPEN', 'ACTIVE'] } }),
      User.countDocuments(approvalFilter),
      Attendance.countDocuments({ ...attendanceFilter, 'checkIn.time': { $exists: true }, 'checkOut.time': { $exists: false } }),
      Job.aggregate([
        { $match: { ...jobFilter, status: { $in: ['OPEN', 'ACTIVE'] } } },
        { $group: { _id: null, total: { $sum: '$requiredWorkers' } } }
      ])
    ]);

    const results = {
      users: totalUsers,
      admins: totalAdmins,
      workers: totalWorkers,
      clients: totalClients,
      activeJobs,
      pendingApprovals,
      clockedIn,
      totalWorkersInJobs: totalWorkersInJobs[0]?.total || 0
    };

    console.log('Stats calculated:', results);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Stats error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{id}:
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
 * /admin/users/{id}/approve:
 *   patch:
 *     summary: Approve promoter
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
      action: 'PROMOTER_APPROVED',
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
 * /admin/users/{id}/reject:
 *   patch:
 *     summary: Reject promoter
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
      action: 'PROMOTER_REJECTED',
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
 * /admin/users/{id}:
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

// ============ ADMIN USERS ============

/**
 * @swagger
 * /admin/admins:
 *   post:
 *     summary: Create a new admin user
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, SUPER_ADMIN]
 *     responses:
 *       201:
 *         description: Admin created
 */
router.post('/admins', authorize('SUPER_ADMIN', 'ADMIN'), validate(schemas.createAdmin), async (req, res, next) => {
  try {
    const { name, email, password, role = 'ADMIN' } = req.body;

    // Only SUPER_ADMIN can create SUPER_ADMIN
    const createdRole = (role === 'SUPER_ADMIN' && req.user.role === 'SUPER_ADMIN') ? 'SUPER_ADMIN' : 'ADMIN';

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: createdRole,
      isApproved: true
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ADMIN_CREATED',
      entityType: 'User',
      entityId: user._id
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved
      }
    });
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
 *             example:
 *               name: John Doe
 *               email: john@company.com
 *               password: password123
 *               companyName: Acme Corp
 *               contactPhone: "1234567890"
 *               industry: Technology
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               companyName:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               companyAddress:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *                   country:
 *                     type: string
 *               industry:
 *                 type: string
 *     responses:
 *       201:
 *         description: Client created
 */
router.post('/clients', validate(schemas.createClient), async (req, res, next) => {
  try {
    const { name, email, password, companyName, contactPhone, companyAddress, industry, assignedAdminId } = req.body;

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
      assignedAdminId: assignedAdminId || (req.user.role === 'ADMIN' ? req.user._id : undefined),
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

    const filter = {};
    if (req.user.role === 'ADMIN') {
      filter.assignedAdminId = req.user._id;
    }

    const clients = await Client.find(filter)
      .populate('userId', 'name email phone')
      .populate('assignedAdminId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Client.countDocuments(filter);

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
 * /admin/clients/{id}:
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

/**
 * @swagger
 * /admin/clients/{id}/assign-admin:
 *   patch:
 *     summary: Assign/Reassign an admin to a client
 *     tags: [Admin - Clients]
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
 *             required: [adminId]
 *             properties:
 *               adminId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin assigned
 */
router.patch('/clients/:id/assign-admin', authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { adminId } = req.body;
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const admin = await User.findOne({ _id: adminId, role: { $in: ['ADMIN', 'SUPER_ADMIN'] } });
    if (!admin) {
      return res.status(400).json({ success: false, message: 'Invalid admin ID' });
    }

    client.assignedAdminId = adminId;
    await client.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'CLIENT_ADMIN_ASSIGNED',
      entityType: 'Client',
      entityId: client._id,
      details: { adminId }
    });

    res.json({
      success: true,
      message: 'Admin assigned successfully',
      data: client
    });
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

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      filter.clientId = { $in: clientIds };
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

router.get('/jobs/today', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const filter = {
      startDate: { $lt: tomorrow },
      endDate: { $gte: today },
      status: { $in: ['OPEN', 'ACTIVE'] }
    };

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      filter.clientId = { $in: clientIds };
    }

    const jobs = await Job.find(filter)
      .populate('clientId', 'companyName')
      .sort({ shiftStart: 1 });

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/upcoming', async (req, res, next) => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const filter = {
      startDate: { $gte: tomorrow },
      status: { $in: ['OPEN', 'PENDING'] }
    };

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      filter.clientId = { $in: clientIds };
    }

    const jobs = await Job.find(filter)
      .populate('clientId', 'companyName')
      .sort({ startDate: 1 })
      .limit(20);

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/by-date', async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter is required (YYYY-MM-DD)' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const filter = {
      startDate: { $lt: nextDate },
      endDate: { $gte: targetDate }
    };

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      filter.clientId = { $in: clientIds };
    }

    const jobs = await Job.find(filter)
      .populate('clientId', 'companyName')
      .sort({ shiftStart: 1 });

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/jobs/{id}:
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

    const assignments = await Assignment.find({ jobId: req.params.id })
      .populate('userId', 'name email role profile');

    res.json({ success: true, data: { ...job.toObject(), assignments } });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/jobs:
 *   post:
 *     summary: Create a new job directly (Admin)
 *     tags: [Admin - Jobs]
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
    const { startDate, endDate } = req.body;

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const job = await Job.create({
      ...req.body,
      status: 'OPEN', // Admins create open jobs by default
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_CREATED_BY_ADMIN',
      entityType: 'Job',
      entityId: job._id
    });

    res.status(201).json({
      success: true,
      message: 'Job created and opened successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/jobs/{id}/approve:
 *   patch:
 *     summary: Approve a client job
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job approved
 */
router.patch('/jobs/:id/approve', async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    job.status = 'OPEN';
    await job.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_APPROVED',
      entityType: 'Job',
      entityId: job._id
    });

    res.json({
      success: true,
      message: 'Job approved and is now open',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/jobs/{id}/reject:
 *   patch:
 *     summary: Reject a client job
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job rejected
 */
router.patch('/jobs/:id/reject', async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    job.status = 'CANCELLED';
    await job.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'JOB_REJECTED',
      entityType: 'Job',
      entityId: job._id
    });

    res.json({
      success: true,
      message: 'Job has been rejected',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

// ============ WORKER MANAGEMENT ============

/**
 * @swagger
 * /admin/promoters/{id}/approve:
 *   patch:
 *     summary: Approve a worker profile
 *     tags: [Admin - Workers]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/promoters/:id/approve', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'PROMOTER') {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    user.isApproved = true;
    await user.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'WORKER_APPROVED',
      entityType: 'User',
      entityId: user._id
    });

    res.json({ success: true, message: 'Worker profile has been approved' });
  } catch (error) {
    next(error);
  }
});

// ============ ASSIGNMENTS ============

/**
 * @swagger
 * /admin/assignments:
 *   post:
 *     summary: Assign promoters to a job
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
 *             example:
 *               userIds: ["_promoter_id_1", "_promoter_id_2"]
 *               jobId: _job_id_
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
      role: 'PROMOTER',
      isApproved: true
    });

    if (validWorkers.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid approved promoters found' });
    }

    const existingAssignments = await Assignment.find({
      userId: { $in: validWorkers.map(w => w._id) },
      jobId
    });

    const existingUserIds = existingAssignments.map(a => a.userId.toString());
    const newAssignments = validWorkers
      .filter(w => !existingUserIds.includes(w._id.toString()))
      .map(promoter => ({
        userId: promoter._id,
        jobId,
        assignedBy: req.user._id,
        status: 'PENDING'
      }));

    if (newAssignments.length > 0) {
      await Assignment.insertMany(newAssignments);
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'PROMOTERS_ASSIGNED',
      entityType: 'Job',
      entityId: jobId,
      details: { assignedCount: newAssignments.length }
    });

    res.status(201).json({
      success: true,
      message: `${newAssignments.length} promoter(s) assigned successfully`,
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

    const filter = { date: { $gte: today } };
    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      filter.jobId = { $in: jobIds };
    }

    const attendance = await Attendance.find(filter).populate('userId', 'name').populate('jobId', 'title');

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

    const filter = { date: { $gte: weekAgo } };
    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      filter.jobId = { $in: jobIds };
    }

    const attendance = await Attendance.find(filter).populate('userId', 'name').populate('jobId', 'title');

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

    const filter = { date: { $gte: monthAgo } };
    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      filter.jobId = { $in: jobIds };
    }

    const attendance = await Attendance.find(filter).populate('userId', 'name').populate('jobId', 'title');

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

// ============ JOB APPLICATIONS ============

import { JobApplication } from '../../models/JobApplication.js';

/**
 * @swagger
 * /admin/applications:
 *   get:
 *     summary: Get all job applications
 *     tags: [Admin - Applications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/applications', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.jobId) {
      filter.jobId = req.query.jobId;
    }

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      
      if (filter.jobId) {
        // If jobId is requested, check if it's in the allowed list
        if (!jobIds.some(id => id.toString() === filter.jobId.toString())) {
          return res.json({ success: true, data: [] });
        }
      } else {
        filter.jobId = { $in: jobIds };
      }
    }
    const applications = await JobApplication.find(filter)
      .populate('userId', 'name email phone')
      .populate('jobId', 'title')
      .sort({ appliedAt: -1 });

    res.json({ success: true, data: applications });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/applications/{id}/approve:
 *   patch:
 *     summary: Approve a job application and create assignment
 *     tags: [Admin - Applications]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/applications/:id/approve', async (req, res, next) => {
  try {
    const application = await JobApplication.findById(req.params.id).populate('userId');
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (!application.userId) {
        return res.status(400).json({ success: false, message: 'Associated user not found for this application' });
    }

    // Check if worker profile is approved
    if (!application.userId.isApproved) {
      return res.status(400).json({ success: false, message: 'Worker profile must be approved by admin before job assignment' });
    }

    // Check staffing limit
    const job = await Job.findById(application.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const confirmedCount = await Assignment.countDocuments({ jobId: application.jobId, status: { $in: ['PENDING', 'ACTIVE', 'COMPLETED'] } });
    
    if (confirmedCount >= (job.requiredWorkers || 1)) {
      return res.status(400).json({ success: false, message: 'Job is already fully staffed' });
    }

    application.status = 'APPROVED';
    await application.save();

    // Create Assignment
    const assignment = await Assignment.create({
      userId: application.userId._id,
      jobId: application.jobId,
      assignedBy: req.user._id,
      status: 'PENDING'
    });

    // If fully staffed now, mark job as ACTIVE (optional, but good for UX)
    if (confirmedCount + 1 >= (job.requiredWorkers || 1)) {
      job.status = 'ACTIVE';
      await job.save();
    }

    res.json({ success: true, message: 'Application approved and assignment created', data: { application, assignment } });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/applications/{id}/reject:
 *   patch:
 *     summary: Reject a job application
 *     tags: [Admin - Applications]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/applications/:id/reject', async (req, res, next) => {
  try {
    const application = await JobApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    application.status = 'REJECTED';
    await application.save();

    res.json({ success: true, message: 'Application rejected', data: application });
  } catch (error) {
    next(error);
  }
});

// ============ PAYMENTS ============

import { Payment } from '../../models/Payment.js';

/**
 * @swagger
 * /admin/payments/generate:
 *   post:
 *     summary: Generate payments for completed attendance
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/payments/generate', async (req, res, next) => {
  try {
    const { jobId } = req.body;
    
    // Find all attendance records for this job that don't have a payment yet
    // Or just all attendance with totalHours > 0
    // Simplify for now: generate payment by looking at attendance
    const attendances = await Attendance.find({ jobId, totalHours: { $gt: 0 } });
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const wagePerHour = job.wage || 0; // assuming job.wage is per hour
    const paymentsGenerated = [];

    for (const record of attendances) {
      // Check if a payment for this attendance/job combination exists? In instructions, Payment has jobId and userId. Let's just create one if none exists for this specific combination.
      // Usually would link to attendanceId. The Prompt dictates fields: userId, jobId, totalHours, amount, status.
      // We will aggregate by user for the job, or just map attendance to a payment. 
      // Let's aggregate by user for this job.
      
      const existingPayment = await Payment.findOne({ userId: record.userId, jobId });
      if (!existingPayment) {
        // Aggregate all hours for this user in this job
        const userAttendances = attendances.filter(a => a.userId.toString() === record.userId.toString());
        const totalHours = userAttendances.reduce((sum, a) => sum + (a.totalHours || 0), 0);
        const amount = totalHours * wagePerHour;

        const newPayment = await Payment.create({
          userId: record.userId,
          jobId,
          totalHours,
          amount,
          status: 'PENDING'
        });
        paymentsGenerated.push(newPayment);
      }
    }

    res.status(201).json({ success: true, message: `Generated ${paymentsGenerated.length} new payments`, data: paymentsGenerated });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/payments/{id}:
 *   patch:
 *     summary: Update payment status
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/payments/:id', async (req, res, next) => {
  try {
    const { status } = req.body; // PENDING, PAID, ON_HOLD
    const payment = await Payment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    res.json({ success: true, message: 'Payment updated', data: payment });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/payments', async (req, res, next) => {
  try {
    const { status, jobId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (jobId) filter.jobId = jobId;

    if (req.user.role === 'ADMIN') {
      const assignedClients = await Client.find({ assignedAdminId: req.user._id }).select('_id');
      const clientIds = assignedClients.map(c => c._id);
      const assignedJobs = await Job.find({ clientId: { $in: clientIds } }).select('_id');
      const jobIds = assignedJobs.map(j => j._id);
      
      if (filter.jobId) {
        if (!jobIds.some(id => id.toString() === filter.jobId.toString())) {
          return res.json({ success: true, data: [] });
        }
      } else {
        filter.jobId = { $in: jobIds };
      }
    }

    const payments = await Payment.find(filter)
      .populate('userId', 'name email phone')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
});

export default router;