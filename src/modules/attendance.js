import { Router } from 'express';
import { Attendance } from '../models/Attendance.js';
import { Assignment } from '../models/Assignment.js';
import { Job } from '../models/Job.js';
import { User } from '../models/User.js';
import { auth } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';
import { getSocketManager } from '../utils/socket.js';
import { Notification } from '../models/Notification.js';

const router = Router();

const idempotencyStore = new Map();

const checkIdempotency = (key, res) => {
  if (idempotencyStore.has(key)) {
    return { used: true, response: idempotencyStore.get(key) };
  }
  return { used: false };
};

const setIdempotency = (key, response) => {
  idempotencyStore.set(key, response);
  setTimeout(() => idempotencyStore.delete(key), 300000);
};

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

const determineAttendanceStatus = (checkInTime, shiftStart) => {
  if (!shiftStart) return 'ON_TIME';
  const [hours, minutes] = shiftStart.split(':').map(Number);
  const expectedTime = new Date();
  expectedTime.setHours(hours, minutes, 0, 0);
  
  const checkIn = new Date(checkInTime);
  const diffMinutes = (checkIn - expectedTime) / (1000 * 60);
  
  if (diffMinutes > 0) {
    if (diffMinutes <= 15) return 'LATE';
    return 'VERY_LATE';
  }
  return 'ON_TIME';
};

/**
 * @swagger
 * /attendance/check-in:
 *   post:
 *     summary: Check in to a job
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobId
 *               - location
 *             properties:
 *               jobId:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *                   address:
 *                     type: string
 *     responses:
 *       201:
 *         description: Check-in successful
 *       400:
 *         description: Already checked in or invalid job
 *       403:
 *         description: Outside job location (geofencing)
 */
router.post('/check-in', auth, validate(schemas.checkIn), async (req, res, next) => {
  try {
    const { jobId, location } = req.body;
    const userId = req.user._id;

    if (req.user.role !== 'WORKER') {
      return res.status(403).json({ success: false, message: 'Only workers can check in' });
    }

    if (!req.user.isApproved) {
      return res.status(403).json({ success: false, message: 'Account not approved' });
    }

    const assignment = await Assignment.findOne({
      userId,
      jobId,
      status: 'ACTIVE'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'No active assignment for this job' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (job.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Job is not active' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobStartDate = new Date(job.startDate);
    jobStartDate.setHours(0, 0, 0, 0);
    const jobEndDate = new Date(job.endDate);
    jobEndDate.setHours(23, 59, 59, 999);

    if (today < jobStartDate || today > jobEndDate) {
      return res.status(400).json({ 
        success: false, 
        message: `Job is scheduled from ${job.startDate.toDateString()} to ${job.endDate.toDateString()}. Cannot check in today.`
      });
    }

    const jobLocation = job.location;
    const radius = jobLocation?.radius || 500;

    if (!isWithinGeofence(location.lat, location.lng, jobLocation, radius)) {
      await ActivityLog.create({
        userId,
        action: 'CHECK_IN_REJECTED_GEOFENCE',
        entityType: 'Attendance',
        details: { jobId, userLat: location.lat, userLng: location.lng }
      });
      return res.status(403).json({ 
        success: false, 
        message: `You must be within ${radius} meters of the job location to check in`,
        data: {
          requiredRadius: radius,
          yourLocation: { lat: location.lat, lng: location.lng },
          jobLocation: { lat: jobLocation?.lat, lng: jobLocation?.lng }
        }
      });
    }

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
          checkIn: {
            time: new Date(),
            location,
            verified: true
          },
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
        checkIn: {
          time: new Date(),
          location,
          verified: true
        },
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
      details: { jobId, location }
    });

    const socketManager = getSocketManager();
    if (socketManager) {
      const eventData = {
        type: 'CHECK_IN',
        userId: req.user._id,
        userName: req.user.name,
        jobId,
        jobTitle: job.title,
        time: attendance.checkIn.time,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'worker:check-in', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'worker:check-in', eventData);
      socketManager.emitToRole('CLIENT', 'worker:check-in', eventData);

      const clientUsers = await User.find({ role: 'CLIENT', isApproved: true });
      for (const client of clientUsers) {
        const jobClientId = job.clientId?.toString();
        if (jobClientId && client._id.toString() === jobClientId) {
          await socketManager.sendNotification(
            client._id,
            'Worker Checked In',
            `${req.user.name} checked in to ${job.title}`,
            'CHECK_IN',
            eventData
          );
        }
      }

      const adminUsers = await User.find({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] }, isApproved: true });
      for (const admin of adminUsers) {
        await socketManager.sendNotification(
          admin._id,
          'Worker Checked In',
          `${req.user.name} checked in to ${job.title}`,
          'CHECK_IN',
          eventData
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Check-in successful',
      data: {
        attendanceId: attendance._id,
        checkInTime: attendance.checkIn.time,
        jobTitle: job.title
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /attendance/check-out:
 *   post:
 *     summary: Check out from a job
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobId
 *               - location
 *             properties:
 *               jobId:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: number
 *                   lng: number
 *                   address: string
 *     responses:
 *       200:
 *         description: Check-out successful
 *       400:
 *         description: Not checked in yet
 */
router.post('/check-out', auth, validate(schemas.checkOut), async (req, res, next) => {
  try {
    const { jobId, location } = req.body;
    const userId = req.user._id;

    if (req.user.role !== 'WORKER') {
      return res.status(403).json({ success: false, message: 'Only workers can check out' });
    }

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

    const job = await Job.findById(jobId);
    const jobLocation = job?.location;
    const radius = jobLocation?.radius || 500;

    let withinGeofence = true;
    if (location) {
      withinGeofence = isWithinGeofence(location.lat, location.lng, jobLocation, radius);
    }

    const updatedAttendance = await Attendance.findByIdAndUpdate(
      attendance._id,
      {
        checkOut: {
          time: checkOutTime,
          location,
          verified: withinGeofence
        },
        totalHours,
        status: 'PRESENT'
      },
      { new: true }
    ).populate('jobId', 'title');

    await ActivityLog.create({
      userId,
      action: 'CHECK_OUT',
      entityType: 'Attendance',
      entityId: attendance._id,
      details: { jobId, totalHours, withinGeofence }
    });

    const socketManager = getSocketManager();
    if (socketManager) {
      const eventData = {
        type: 'CHECK_OUT',
        userId: req.user._id,
        userName: req.user.name,
        jobId,
        jobTitle: job.title,
        totalHours,
        timestamp: new Date().toISOString()
      };

      socketManager.emitToRole('ADMIN', 'worker:check-out', eventData);
      socketManager.emitToRole('SUPER_ADMIN', 'worker:check-out', eventData);
    }

    res.json({
      success: true,
      message: 'Check-out successful',
      data: {
        attendanceId: updatedAttendance._id,
        checkInTime: updatedAttendance.checkIn.time,
        checkOutTime: updatedAttendance.checkOut.time,
        totalHours: updatedAttendance.totalHours,
        verified: updatedAttendance.checkOut.verified
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /attendance/user/{userId}:
 *   get:
 *     summary: Get attendance records for a user
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: jobId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
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
 *         description: List of attendance records
 */
router.get('/user/:userId', auth, async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const { jobId, startDate, endDate, page = 1, limit = 20 } = req.query;

    if (req.user.role === 'WORKER' && req.user._id.toString() !== targetUserId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const filter = { userId: targetUserId };

    if (jobId) filter.jobId = jobId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const records = await Attendance.find(filter)
      .populate('jobId', 'title location')
      .sort({ date: -1, 'checkIn.time': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attendance.countDocuments(filter);

    res.json({
      success: true,
      data: records,
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
 * /attendance/today:
 *   get:
 *     summary: Get today's attendance for current user
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's attendance record
 */
router.get('/today', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'WORKER') {
      return res.status(403).json({ success: false, message: 'Only workers can access this endpoint' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today
    }).populate('jobId', 'title location');

    res.json({
      success: true,
      data: attendance || null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /attendance/{id}:
 *   get:
 *     summary: Get attendance record by ID
 *     tags: [Attendance]
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
 *         description: Attendance record
 *       404:
 *         description: Not found
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('jobId', 'title location wage');

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (req.user.role === 'WORKER' && attendance.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
});

export default router;