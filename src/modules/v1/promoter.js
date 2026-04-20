import { Router } from 'express';
import { Job } from '../../models/Job.js';
import { Assignment } from '../../models/Assignment.js';
import { Attendance } from '../../models/Attendance.js';
import { Availability } from '../../models/Availability.js';
import { JobApplication } from '../../models/JobApplication.js';
import { Payment } from '../../models/Payment.js';
import { auth, authorize } from '../../middlewares/auth.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { validate, schemas } from '../../middlewares/validation.js';

const router = Router();

router.use(auth, authorize('PROMOTER'));

// Helper functions
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const isWithinGeofence = (userLat, userLng, jobLocation, radius = 500) => {
  if (!jobLocation || !jobLocation.lat || !jobLocation.lng) return true;
  const distance = calculateDistance(userLat, userLng, jobLocation.lat, jobLocation.lng);
  return distance <= radius;
};

/**
 * @swagger
 * /promoter/profile:
 *   get:
 *     summary: Get promoter profile
 *     tags: [Worker - Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Worker profile
 */
router.get('/profile', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        isApproved: req.user.isApproved
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/dashboard-stats:
 *   get:
 *     summary: Get promoter dashboard statistics
 *     tags: [Worker - Profile]
 *     security:
 *       - bearerAuth: []
 */
router.get('/dashboard-stats', async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Next Shift
    const assignments = await Assignment.find({
      userId,
      status: { $in: ['PENDING', 'ACTIVE'] }
    }).populate({
      path: 'jobId',
      populate: { path: 'clientId', select: 'companyName' }
    });
    
    const now = new Date();
    const nextShiftRecord = assignments
      .filter(a => a.jobId && new Date(a.jobId.startDate) >= new Date(now.setHours(0,0,0,0)))
      .sort((a, b) => new Date(a.jobId.startDate) - new Date(b.jobId.startDate))[0];

    // 2. Hours this week
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const attendance = await Attendance.find({
      userId,
      date: { $gte: startOfWeek }
    });
    const hoursThisWeek = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);

    // 3. Pending Payout
    const payments = await Payment.find({
      userId,
      status: 'PENDING'
    });
    const pendingPayout = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        nextShift: nextShiftRecord ? {
          title: nextShiftRecord.jobId.title,
          startDate: nextShiftRecord.jobId.startDate,
          location: nextShiftRecord.jobId.location,
          companyName: nextShiftRecord.jobId.clientId?.companyName || 'Private Client'
        } : null,
        hoursThisWeek: parseFloat(hoursThisWeek.toFixed(1)),
        pendingPayout: parseFloat(pendingPayout.toFixed(2))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/profile:
 *   put:
 *     summary: Update promoter profile
 *     tags: [Worker - Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: string
 *               phone: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', validate(schemas.updateUser), async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await req.user.constructor.findByIdAndUpdate(
      req.user._id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).select('-password');

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// ============ AVAILABILITY ============

/**
 * @swagger
 * /promoter/availability:
 *   post:
 *     summary: Set availability
 *     tags: [Worker - Availability]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, isAvailable]
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               isAvailable:
 *                 type: boolean
 *               shift:
 *                 type: object
 *     responses:
 *       201:
 *         description: Availability set
 */
router.post('/availability', async (req, res, next) => {
  try {
    const { date, isAvailable, shift, reason } = req.body;

    const availability = await Availability.findOneAndUpdate(
      { userId: req.user._id, date: new Date(date) },
      { isAvailable, shift, reason },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Availability set',
      data: availability
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/availability:
 *   get:
 *     summary: Get availability
 *     tags: [Worker - Availability]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Availability records
 */
router.get('/availability', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { userId: req.user._id };
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const availability = await Availability.find(filter).sort({ date: 1 });

    res.json({ success: true, data: availability });
  } catch (error) {
    next(error);
  }
});

// ============ JOBS ============

/**
 * @swagger
 * /promoter/jobs:
 *   get:
 *     summary: Get assigned jobs
 *     tags: [Worker - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned jobs
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const assignments = await Assignment.find({ userId: req.user._id })
      .populate({
        path: 'jobId',
        populate: { path: 'clientId', select: 'companyName' }
      })
      .sort({ assignedAt: -1 });

    const jobs = assignments
      .filter(a => a.jobId)
      .map(a => ({
        ...a.jobId.toObject(),
        assignmentStatus: a.status,
        assignedAt: a.assignedAt,
        startedAt: a.startedAt,
        completedAt: a.completedAt
      }));

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/jobs/:id:
 *   get:
 *     summary: Get job by ID
 *     tags: [Worker - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job details
 */
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const assignment = await Assignment.findOne({
      userId: req.user._id,
      jobId: req.params.id
    }).populate({
      path: 'jobId',
      populate: { path: 'clientId', select: 'companyName contactEmail' }
    });

    if (!assignment || !assignment.jobId) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.json({ success: true, data: assignment.jobId });
  } catch (error) {
    next(error);
  }
});

// ============ ATTENDANCE ============

/**
 * @swagger
 * /promoter/attendance/check-in:
 *   post:
 *     summary: Check in to job
 *     tags: [Worker - Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobId, location]
 *     responses:
 *       201:
 *         description: Check-in successful
 *       400:
 *         description: Already checked in
 *       403:
 *         description: Outside job location
 */
router.post('/attendance/check-in', validate(schemas.checkIn), async (req, res, next) => {
  try {
    const { jobId, location } = req.body;
    const userId = req.user._id;

    if (!req.user.isApproved) {
      return res.status(403).json({ success: false, message: 'Account not approved' });
    }

    const assignment = await Assignment.findOne({
      userId,
      jobId,
      status: { $in: ['PENDING', 'ACTIVE'] }
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'No active assignment for this job' });
    }

    const job = await Job.findById(jobId);
    const jobLocation = job?.location;
    const radius = jobLocation?.radius || 500;

    if (!isWithinGeofence(location.lat, location.lng, jobLocation, radius)) {
      await ActivityLog.create({
        userId,
        action: 'CHECK_IN_REJECTED_GEOFENCE',
        details: { jobId, userLat: location.lat, userLng: location.lng }
      });
      return res.status(403).json({ 
        success: false, 
        message: `You must be within ${radius} meters of the job location`,
        data: { requiredRadius: radius }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      userId,
      jobId,
      date: today
    });

    if (existingAttendance?.checkIn?.time) {
      return res.status(400).json({ success: false, message: 'Already checked in today' });
    }

    let attendance;
    if (existingAttendance) {
      attendance = await Attendance.findByIdAndUpdate(
        existingAttendance._id,
        {
          checkIn: { time: new Date(), location, verified: true },
          status: 'PRESENT'
        },
        { new: true }
      );
    } else {
      attendance = await Attendance.create({
        userId,
        jobId,
        assignmentId: assignment._id,
        date: today,
        checkIn: { time: new Date(), location, verified: true },
        status: 'PRESENT'
      });
    }

    assignment.status = 'ACTIVE';
    assignment.startedAt = assignment.startedAt || new Date();
    await assignment.save();

    await ActivityLog.create({
      userId,
      action: 'CHECK_IN',
      entityType: 'Attendance',
      entityId: attendance._id,
      details: { jobId }
    });

    res.status(201).json({
      success: true,
      message: 'Check-in successful',
      data: { attendanceId: attendance._id, checkInTime: attendance.checkIn.time }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/attendance/check-out:
 *   post:
 *     summary: Check out from job
 *     tags: [Worker - Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobId, location]
 *     responses:
 *       200:
 *         description: Check-out successful
 *       400:
 *         description: Not checked in
 */
router.post('/attendance/check-out', validate(schemas.checkOut), async (req, res, next) => {
  try {
    const { jobId, location } = req.body;
    const userId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      userId,
      jobId,
      date: today
    });

    if (!attendance || !attendance.checkIn?.time) {
      return res.status(400).json({ success: false, message: 'You have not checked in yet' });
    }

    if (attendance.checkOut?.time) {
      return res.status(400).json({ success: false, message: 'Already checked out today' });
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendance.checkIn.time);
    const totalMs = checkOutTime - checkInTime;
    const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;

    const updatedAttendance = await Attendance.findByIdAndUpdate(
      attendance._id,
      {
        checkOut: { time: checkOutTime, location },
        totalHours,
        status: 'PRESENT'
      },
      { new: true }
    );

    await ActivityLog.create({
      userId,
      action: 'CHECK_OUT',
      details: { jobId, totalHours }
    });

    res.json({
      success: true,
      message: 'Check-out successful',
      data: {
        attendanceId: updatedAttendance._id,
        totalHours: updatedAttendance.totalHours
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/attendance:
 *   get:
 *     summary: Get attendance records
 *     tags: [Worker - Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Attendance records
 */
router.get('/attendance', async (req, res, next) => {
  try {
    const { jobId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = { userId: req.user._id };

    if (jobId) filter.jobId = jobId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const attendance = await Attendance.find(filter)
      .populate('jobId', 'title location')
      .sort({ date: -1, 'checkIn.time': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attendance.countDocuments(filter);

    res.json({
      success: true,
      data: attendance,
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

// ============ JOB APPLICATIONS ============

/**
 * @swagger
 * /promoter/available-jobs:
 *   get:
 *     summary: Get available jobs
 *     tags: [Worker - Jobs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/available-jobs', async (req, res, next) => {
  try {
    // Only show jobs in future or active, not fully staffed (optional logic)
    const jobs = await Job.find({ status: { $in: ['OPEN', 'ACTIVE'] } }).sort({ startDate: 1 });
    // Maybe also populate whether they applied already
    const myApplications = await JobApplication.find({ userId: req.user._id });
    const appliedJobIds = myApplications.map(app => app.jobId.toString());

    res.json({ 
      success: true, 
      data: jobs.map(job => ({
        ...job.toObject(),
        hasApplied: appliedJobIds.includes(job._id.toString()),
        applicationStatus: myApplications.find(a => a.jobId.toString() === job._id.toString())?.status
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /promoter/apply/:jobId:
 *   post:
 *     summary: Apply for a job
 *     tags: [Worker - Jobs]
 *     security:
 *       - bearerAuth: []
 */
router.post('/apply/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!req.user.isApproved) {
      return res.status(403).json({ success: false, message: 'You must be approved to apply for jobs.' });
    }

    const job = await Job.findById(jobId);
    if (!job || job.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, message: 'Job not found or not active.' });
    }

    const existingApp = await JobApplication.findOne({ userId: req.user._id, jobId });
    if (existingApp) {
      return res.status(400).json({ success: false, message: 'You have already applied for this job.' });
    }

    const application = await JobApplication.create({
      userId: req.user._id,
      jobId
    });

    res.status(201).json({ success: true, message: 'Successfully applied for job', data: application });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already applied for this job.' });
    }
    next(error);
  }
});

// ============ EARNINGS ============

/**
 * @swagger
 * /promoter/earnings:
 *   get:
 *     summary: Get worker earnings/payments
 *     tags: [Worker - Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/earnings', async (req, res, next) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
});

export default router;