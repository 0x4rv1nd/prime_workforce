import { Router } from 'express';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { Job } from '../models/Job.js';
import { hashPassword } from '../utils/auth.js';
import { auth, authorize } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';

const router = Router();

/**
 * @swagger
 * /clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
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
 *       400:
 *         description: Email already exists
 */
router.post('/', auth, authorize('ADMIN'), validate(schemas.createClient), async (req, res, next) => {
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
 * /clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Clients]
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
 *     responses:
 *       200:
 *         description: List of clients
 */
router.get('/', auth, authorize('ADMIN', 'CLIENT'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (req.user.role === 'CLIENT') {
      const client = await Client.findOne({ userId: req.user._id });
      if (client) {
        filter._id = client._id;
      }
    }

    const clients = await Client.find(filter)
      .populate('userId', 'name email')
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
 * /clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
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
router.get('/:id', auth, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).populate('userId', 'name email phone');
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (req.user.role === 'CLIENT' && client.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /clients/{id}:
 *   put:
 *     summary: Update client
 *     tags: [Clients]
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
router.put('/:id', auth, authorize('ADMIN', 'CLIENT'), validate(schemas.updateClient), async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (req.user.role === 'CLIENT' && client.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
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
 * /clients/{id}/jobs:
 *   get:
 *     summary: Get jobs for a client
 *     tags: [Clients]
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
 *         description: List of jobs
 */
router.get('/:id/jobs', auth, async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (req.user.role === 'CLIENT' && client.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const jobs = await Job.find({ clientId: client._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
});

export default router;