import { Router } from 'express';
import { User } from '../models/User.js';
import { Client } from '../models/Client.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { auth, authorize } from '../middlewares/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { validate, schemas } from '../middlewares/validation.js';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new worker (Public)
 *     tags: [Auth - Worker]
 *     description: Workers can self-register. They need admin approval to login.
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
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: Worker registered successfully
 *       400:
 *         description: Validation error or email already exists
 */
router.post('/register', validate(schemas.register), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'WORKER',
      isApproved: false
    });

    await ActivityLog.create({
      userId: user._id,
      action: 'USER_REGISTERED'
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Waiting for admin approval.',
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

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user (Public)
 *     tags: [Auth - Login]
 *     description: Login with email and password. Returns JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: superadmin@primeworkforce.com
 *               password:
 *                 type: string
 *                 example: superadmin123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account pending approval
 */
router.post('/login', validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && !user.isApproved) {
      return res.status(403).json({ success: false, message: 'Account pending approval' });
    }

    const token = generateToken(user);

    await ActivityLog.create({
      userId: user._id,
      action: 'USER_LOGIN'
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/admin-approve/{id}:
 *   post:
 *     summary: Approve a worker (Admin/Super Admin)
 *     tags: [Auth - Approval]
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
 *         description: Worker approved successfully
 *       400:
 *         description: User not a worker or already approved
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/admin-approve/:id', auth, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role !== 'WORKER') {
      return res.status(400).json({ success: false, message: 'Can only approve workers' });
    }

    user.isApproved = true;
    await user.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: `APPROVED_WORKER_${user._id}`
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

export default router;