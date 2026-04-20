import { Router } from 'express';
import { Job } from '../../models/Job.js';
import { Client } from '../../models/Client.js';
import { Assignment } from '../../models/Assignment.js';
import { Attendance } from '../../models/Attendance.js';
import { Payment } from '../../models/Payment.js';
import { auth, authorize } from '../../middlewares/auth.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { validate, schemas } from '../../middlewares/validation.js';

const router = Router();

router.use(auth, authorize('CLIENT'));

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
 * /client/profile:
 *   patch:
 *     summary: Update client profile
 *     tags: [Client - Profile]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/profile', async (req, res, next) => {
  try {
    const { name, phone, companyName, industry, companyAddress } = req.body;
    
    // Update User model fields
    if (name || phone) {
      const updateData = {};
      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      await req.user.constructor.findByIdAndUpdate(req.user._id, updateData);
    }

    // Update Client model fields
    const client = await Client.findOne({ userId: req.user._id });
    if (client) {
      if (companyName) client.companyName = companyName;
      if (industry) client.industry = industry;
      if (companyAddress) client.companyAddress = { ...client.companyAddress, ...companyAddress };
      await client.save();
    }

    const updatedClient = await Client.findOne({ userId: req.user._id }).populate('userId', 'name email phone');
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: updatedClient 
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

router.get('/jobs/today', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const jobs = await Job.find({
      clientId: client._id,
      startDate: { $lt: tomorrow },
      endDate: { $gte: today },
      status: { $in: ['OPEN', 'ACTIVE'] }
    }).sort({ shiftStart: 1 });

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/upcoming', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const jobs = await Job.find({
      clientId: client._id,
      startDate: { $gte: tomorrow },
      status: { $in: ['OPEN', 'PENDING'] }
    }).sort({ startDate: 1 }).limit(20);

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/by-date', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter is required (YYYY-MM-DD)' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const jobs = await Job.find({
      clientId: client._id,
      startDate: { $lt: nextDate },
      endDate: { $gte: targetDate }
    }).sort({ shiftStart: 1 });

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /client/jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     tags: [Client - Jobs]
 *     security:
 *       - bearerAuth: []
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

    const assignments = await Assignment.find({ jobId: req.params.id })
      .populate('userId', 'name email role profile');

    res.json({ success: true, data: { ...job.toObject(), assignments } });
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
 * /client/attendance/{userId}:
 *   get:
 *     summary: Get attendance for specific promoter
 *     tags: [Client - Attendance]
 *     security:
 *       - bearerAuth: []
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

/**
 * @swagger
 * /client/payments:
 *   get:
 *     summary: Get payments for client jobs
 *     tags: [Client - Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/payments', async (req, res, next) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) {
      return res.json({ success: true, data: [] });
    }

    const jobs = await Job.find({ clientId: client._id }).select('_id');
    const jobIds = jobs.map(j => j._id);

    const payments = await Payment.find({ jobId: { $in: jobIds } })
      .populate('userId', 'name email')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });

    // Client only sees status, not the amount
    const sanitizedPayments = payments.map(p => {
      const obj = p.toObject();
      delete obj.amount;
      return obj;
    });

    res.json({ success: true, data: sanitizedPayments });
  } catch (error) {
    next(error);
  }
});

export default router;