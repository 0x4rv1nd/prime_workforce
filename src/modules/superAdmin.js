import { Router } from 'express';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { hashPassword } from '../utils/auth.js';
import { auth, authorize } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';

const router = Router();

/**
 * @swagger
 * /super-admin/admins:
 *   post:
 *     summary: Create a new admin
 *     tags: [Super Admin - Admin Management]
 *     description: Create a new admin user. Only Super Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Admin User
 *               email:
 *                 type: string
 *                 example: admin@primeworkforce.com
 *               password:
 *                 type: string
 *                 example: admin123
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       400:
 *         description: Email already exists or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only Super Admin allowed
 */
router.post('/admins', auth, authorize('SUPER_ADMIN'), validate(schemas.createAdmin), async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const admin = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'ADMIN',
      isApproved: true,
      phone
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ADMIN_CREATED',
      entityType: 'User',
      entityId: admin._id,
      details: { createdBy: 'SUPER_ADMIN' }
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isApproved: admin.isApproved
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/admins:
 *   get:
 *     summary: Get all admins
 *     tags: [Super Admin - Admin Management]
 *     description: Retrieve all admin users. Only Super Admin can access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of admins retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only Super Admin allowed
 */
router.get('/admins', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const admins = await User.find({ role: 'ADMIN' })
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ role: 'ADMIN' });

    res.json({
      success: true,
      data: admins,
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
 * /super-admin/admins/{id}:
 *   get:
 *     summary: Get admin by ID
 *     tags: [Super Admin - Admin Management]
 *     description: Retrieve a specific admin by ID. Only Super Admin can access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 64f8a2b3c9e1a1234567890a
 *         description: Admin ID
 *     responses:
 *       200:
 *         description: Admin details retrieved successfully
 *       404:
 *         description: Admin not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/admins/:id', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'ADMIN' }).select('-password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.json({ success: true, data: admin });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/admins/{id}:
 *   put:
 *     summary: Update admin
 *     tags: [Super Admin - Admin Management]
 *     description: Update admin details. Only Super Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 64f8a2b3c9e1a1234567890a
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Admin
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *               isApproved:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Admin updated successfully
 *       404:
 *         description: Admin not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.put('/admins/:id', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'ADMIN' });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const allowedFields = ['name', 'phone', 'isApproved'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedAdmin = await User.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).select('-password');

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ADMIN_UPDATED',
      entityType: 'User',
      entityId: req.params.id,
      details: updates
    });

    res.json({ success: true, data: updatedAdmin });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/admins/{id}:
 *   delete:
 *     summary: Delete admin
 *     tags: [Super Admin - Admin Management]
 *     description: Delete an admin user. Only Super Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 64f8a2b3c9e1a1234567890a
 *     responses:
 *       200:
 *         description: Admin deleted successfully
 *       404:
 *         description: Admin not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.delete('/admins/:id', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'ADMIN' });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      userId: req.user._id,
      action: 'ADMIN_DELETED',
      entityType: 'User',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/promoters:
 *   post:
 *     summary: Create a new promoter
 *     tags: [Super Admin - Client Management]
 *     description: Create a new promoter. Both Super Admin and Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Worker
 *               email:
 *                 type: string
 *                 example: promoter@example.com
 *               password:
 *                 type: string
 *                 example: promoter123
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *               isApproved:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Worker created successfully
 *       400:
 *         description: Email already exists or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/promoters', auth, authorize('SUPER_ADMIN', 'ADMIN'), validate(schemas.createWorker), async (req, res, next) => {
  try {
    const { name, email, password, phone, isApproved } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const promoter = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'PROMOTER',
      isApproved: isApproved || false,
      phone
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'PROMOTER_CREATED',
      entityType: 'User',
      entityId: promoter._id,
      details: { createdBy: req.user.role }
    });

    res.status(201).json({
      success: true,
      message: 'Worker created successfully',
      data: {
        id: promoter._id,
        name: promoter.name,
        email: promoter.email,
        role: promoter.role,
        isApproved: promoter.isApproved
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/promoters:
 *   get:
 *     summary: Get all promoters (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: List of promoters
 */
router.get('/promoters', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { isApproved, page = 1, limit = 20 } = req.query;
    const filter = { role: 'PROMOTER' };

    if (isApproved !== undefined) {
      filter.isApproved = isApproved === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const promoters = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: promoters,
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
 * /super-admin/promoters/{id}:
 *   get:
 *     summary: Get promoter by ID (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *         description: Worker details
 *       404:
 *         description: Worker not found
 */
router.get('/promoters/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const promoter = await User.findOne({ _id: req.params.id, role: 'PROMOTER' }).select('-password');
    if (!promoter) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    res.json({ success: true, data: promoter });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/promoters/{id}:
 *   put:
 *     summary: Update promoter (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               isApproved:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Worker updated
 *       404:
 *         description: Worker not found
 */
router.put('/promoters/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const promoter = await User.findOne({ _id: req.params.id, role: 'PROMOTER' });
    if (!promoter) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    const allowedFields = ['name', 'phone', 'isApproved'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedWorker = await User.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).select('-password');

    await ActivityLog.create({
      userId: req.user._id,
      action: 'PROMOTER_UPDATED',
      entityType: 'User',
      entityId: req.params.id,
      details: updates
    });

    res.json({ success: true, data: updatedWorker });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/promoters/{id}:
 *   delete:
 *     summary: Delete promoter (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *         description: Worker deleted
 *       404:
 *         description: Worker not found
 */
router.delete('/promoters/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const promoter = await User.findOne({ _id: req.params.id, role: 'PROMOTER' });
    if (!promoter) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      userId: req.user._id,
      action: 'PROMOTER_DELETED',
      entityType: 'User',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'Worker deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/promoters/{id}/approve:
 *   post:
 *     summary: Approve promoter (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *         description: Worker not found
 */
router.post('/promoters/:id/approve', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const promoter = await User.findOne({ _id: req.params.id, role: 'PROMOTER' });
    if (!promoter) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    promoter.isApproved = true;
    await promoter.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'PROMOTER_APPROVED',
      entityType: 'User',
      entityId: req.params.id
    });

    res.json({
      success: true,
      message: 'Worker approved successfully',
      data: { id: promoter._id, isApproved: promoter.isApproved }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Super Admin - Client Management]
 *     description: Create a new client with company details. Both Super Admin and Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - companyName
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Client
 *               email:
 *                 type: string
 *                 example: client@company.com
 *               password:
 *                 type: string
 *                 example: client123
 *               companyName:
 *                 type: string
 *                 example: ABC Corp
 *               contactPhone:
 *                 type: string
 *                 example: +1234567890
 *               companyAddress:
 *                 type: object
 *               industry:
 *                 type: string
 *                 example: Technology
 *     responses:
 *       201:
 *         description: Client created successfully
 *       400:
 *         description: Email already exists or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/clients', auth, authorize('SUPER_ADMIN', 'ADMIN'), validate(schemas.registerClient), async (req, res, next) => {
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
      entityId: client._id,
      details: { createdBy: req.user.role }
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
 * /super-admin/clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Super Admin - Client Management]
 *     description: Retrieve all clients. Both Super Admin and Admin can perform this action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of clients retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/clients', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
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
 * /super-admin/clients/{id}:
 *   get:
 *     summary: Get client by ID (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *         description: Client details
 *       404:
 *         description: Client not found
 */
router.get('/clients/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
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
 * /super-admin/clients/{id}:
 *   put:
 *     summary: Update client (Super Admin or Admin)
 *     tags: [Super Admin - Client Management]
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
 *               companyName:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               companyAddress:
 *                 type: object
 *               industry:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client updated
 *       404:
 *         description: Client not found
 */
router.put('/clients/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const allowedFields = ['companyName', 'contactPhone', 'companyAddress', 'industry'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ).populate('userId', 'name email');

    await ActivityLog.create({
      userId: req.user._id,
      action: 'CLIENT_UPDATED',
      entityType: 'Client',
      entityId: req.params.id,
      details: updates
    });

    res.json({ success: true, data: updatedClient });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/clients/{id}:
 *   delete:
 *     summary: Delete client (Super Admin only)
 *     tags: [Super Admin - Client Management]
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
 *         description: Client deleted
 *       404:
 *         description: Client not found
 */
router.delete('/clients/:id', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    await User.findByIdAndDelete(client.userId);
    await Client.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      userId: req.user._id,
      action: 'CLIENT_DELETED',
      entityType: 'Client',
      entityId: req.params.id
    });

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/dashboard:
 *   get:
 *     summary: Get dashboard stats (Super Admin only)
 *     tags: [Super Admin - Client Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get('/dashboard', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const [totalAdmins, totalWorkers, totalClients, totalJobs, approvedWorkers, pendingWorkers] = await Promise.all([
      User.countDocuments({ role: 'ADMIN' }),
      User.countDocuments({ role: 'PROMOTER' }),
      Client.countDocuments(),
      0, // Job.countDocuments() - can add later
      User.countDocuments({ role: 'PROMOTER', isApproved: true }),
      User.countDocuments({ role: 'PROMOTER', isApproved: false })
    ]);

    res.json({
      success: true,
      data: {
        admins: totalAdmins,
        promoters: totalWorkers,
        clients: totalClients,
        jobs: totalJobs,
        approvedWorkers,
        pendingWorkers
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /super-admin/audit-logs:
 *   get:
 *     summary: Get audit logs
 *     tags: [Super Admin - Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit logs
 */
router.get('/audit-logs', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, action, userId, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter: any = {};
    if (action) filter.action = action;
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate('userId', 'name email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ActivityLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: logs,
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
 * /super-admin/audit-logs/stats:
 *   get:
 *     summary: Get audit logs statistics
 *     tags: [Super Admin - Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit logs stats
 */
router.get('/audit-logs/stats', auth, authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const [totalLogs, actionCounts, recentUsers] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      ActivityLog.aggregate([
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$userId', lastAction: { $first: '$timestamp' } } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalLogs,
        actionCounts: actionCounts.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentUsers
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;