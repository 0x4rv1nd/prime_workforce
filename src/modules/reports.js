import { Router } from 'express';
import { Attendance } from '../models/Attendance.js';
import { Assignment } from '../models/Assignment.js';
import { Job } from '../models/Job.js';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { auth, authorize } from '../middlewares/auth.js';

const router = Router();

router.get('/promoter/:promoterId', auth, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const promoterId = req.params.promoterId;

    const filter = { userId: promoterId };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const attendances = await Attendance.find(filter).populate('jobId', 'title');
    
    const totalHours = attendances.reduce((sum, att) => sum + (att.totalHours || 0), 0);
    const daysWorked = attendances.filter(att => att.checkIn?.time && att.checkOut?.time).length;
    const daysPresent = attendances.filter(att => att.status === 'PRESENT').length;

    res.json({
      success: true,
      data: {
        promoterId,
        totalHours: Math.round(totalHours * 100) / 100,
        daysWorked,
        daysPresent,
        attendances
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/client/:clientId', auth, authorize('ADMIN', 'SUPER_ADMIN', 'CLIENT'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const clientId = req.params.clientId;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const jobFilter = { clientId };
    if (startDate || endDate) {
      jobFilter.createdAt = {};
      if (startDate) jobFilter.createdAt.$gte = new Date(startDate);
      if (endDate) jobFilter.createdAt.$lte = new Date(endDate);
    }

    const jobs = await Job.find(jobFilter);
    const jobIds = jobs.map(j => j._id);

    const assignments = await Assignment.find({ jobId: { $in: jobIds } });
    const activeWorkers = [...new Set(assignments.filter(a => a.status === 'ACTIVE').map(a => a.userId.toString()))];
    const totalWorkers = [...new Set(assignments.map(a => a.userId.toString()))];

    const utilization = totalWorkers.length > 0 
      ? Math.round((activeWorkers.length / totalWorkers.length) * 100) 
      : 0;

    const attendances = await Attendance.find({ 
      jobId: { $in: jobIds },
      ...(startDate || endDate ? { date: { 
        ...(startDate && { $gte: new Date(startDate) }),
        ...(endDate && { $lte: new Date(endDate) })
      }} : {})
    });

    const totalHours = attendances.reduce((sum, att) => sum + (att.totalHours || 0), 0);

    res.json({
      success: true,
      data: {
        clientId,
        totalJobs: jobs.length,
        activeJobs: jobs.filter(j => j.status === 'ACTIVE').length,
        completedJobs: jobs.filter(j => j.status === 'COMPLETED').length,
        totalWorkers: totalWorkers.length,
        activeWorkers: activeWorkers.length,
        workforceUtilization: utilization,
        totalHoursWorked: Math.round(totalHours * 100) / 100
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/job/:jobId', auth, async (req, res, next) => {
  try {
    const jobId = req.params.jobId;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const assignments = await Assignment.find({ jobId }).populate('userId', 'name email');
    const attendances = await Attendance.find({ jobId });

    const totalHours = attendances.reduce((sum, att) => sum + (att.totalHours || 0), 0);
    const daysWorked = attendances.filter(att => att.checkIn?.time && att.checkOut?.time).length;
    const presentDays = attendances.filter(att => att.status === 'PRESENT').length;
    const absentDays = attendances.filter(att => att.status === 'ABSENT').length;

    const promoters = assignments.map(a => ({
      id: a.userId._id,
      name: a.userId.name,
      email: a.userId.email,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt
    }));

    res.json({
      success: true,
      data: {
        jobId: job._id,
        title: job.title,
        status: job.status,
        totalWorkers: assignments.length,
        activeWorkers: assignments.filter(a => a.status === 'ACTIVE').length,
        completedWorkers: assignments.filter(a => a.status === 'COMPLETED').length,
        totalHoursWorked: Math.round(totalHours * 100) / 100,
        daysWorked,
        presentDays,
        absentDays,
        promoters
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', auth, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const [
      totalWorkers,
      activeWorkers,
      totalClients,
      totalJobs,
      activeJobs,
      completedJobs,
      totalAttendances
    ] = await Promise.all([
      User.countDocuments({ role: 'PROMOTER' }),
      User.countDocuments({ role: 'PROMOTER', isApproved: true }),
      Client.countDocuments(),
      Job.countDocuments(dateFilter.start ? { createdAt: dateFilter } : {}),
      Job.countDocuments({ status: 'ACTIVE' }),
      Job.countDocuments({ status: 'COMPLETED' }),
      Attendance.countDocuments(dateFilter.start ? { date: dateFilter } : {})
    ]);

    const attendances = dateFilter.start 
      ? await Attendance.find({ date: dateFilter })
      : await Attendance.find();
    
    const totalHours = attendances.reduce((sum, att) => sum + (att.totalHours || 0), 0);

    res.json({
      success: true,
      data: {
        promoters: { total: totalWorkers, active: activeWorkers },
        clients: { total: totalClients },
        jobs: { total: totalJobs, active: activeJobs, completed: completedJobs },
        attendance: { total: totalAttendances, totalHours: Math.round(totalHours * 100) / 100 }
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;