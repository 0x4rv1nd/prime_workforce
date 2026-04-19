import { z } from 'zod';

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[${}\\"]/g, '').trim();
};

const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const validate = (schema) => {
  return (req, res, next) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
      }
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: (error.issues || error.errors || []).map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

export const schemas = {
  register: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  }),

  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
  }),

  createAdmin: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional()
  }),

  createClient: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    companyName: z.string().min(1, 'Company name is required').max(200),
    contactPhone: z.string().optional(),
    companyAddress: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional()
    }).optional(),
    industry: z.string().optional()
  }),

  updateUser: z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().optional(),
    profileImage: z.string().url().optional()
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
  }),

  updateClient: z.object({
    companyName: z.string().min(1).max(200).optional(),
    contactPhone: z.string().optional(),
    companyAddress: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional()
    }).optional(),
    industry: z.string().optional()
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
  }),

  createJob: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    location: z.object({
      address: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
      radius: z.number().optional()
    }),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    wage: z.object({
      amount: z.number().min(0),
      currency: z.string().optional(),
      type: z.enum(['HOURLY', 'DAILY', 'FIXED']).optional()
    }).optional(),
    requiredWorkers: z.number().int().min(1).optional(),
    skills: z.array(z.string()).optional()
  }),

  assignWorker: z.object({
    userIds: z.array(z.string()).min(1, 'At least one worker required'),
    jobId: z.string()
  }),

  checkIn: z.object({
    jobId: z.string(),
    location: z.object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().optional()
    })
  }),

  checkOut: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().optional()
    })
  }),

  createAdmin: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional()
  }),

  createWorker: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional(),
    isApproved: z.boolean().optional()
  }),

  registerClient: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    companyName: z.string().min(1, 'Company name is required').max(200),
    contactPhone: z.string().optional(),
    companyAddress: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional()
    }).optional(),
    industry: z.string().optional()
  })
};