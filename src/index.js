import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import connectDB from './config/database.js';
import swaggerUi from 'swagger-ui-express';
import swaggerJsDoc from 'swagger-jsdoc';
import { securityMiddleware, authLimiter, generalLimiter } from './middlewares/security.js';
import apiRoutes from './modules/v1.js';
import { initializeSocket } from './utils/socket.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(securityMiddleware);

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['*'];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin || corsOrigin.includes('*') || corsOrigin.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const logger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
};
app.use(logger);

app.use('/auth', authLimiter);
app.use(generalLimiter);

const socketManager = initializeSocket(httpServer);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Prime Workforce API',
      version: '1.0.0',
      description: 'Workforce Management System API - Production Grade'
    },
    servers: [
      ...(process.env.RENDER_EXTERNAL_URL
        ? [{ url: `${process.env.RENDER_EXTERNAL_URL}/api/v1`, description: 'Production server' }]
        : []),
      {
        url: `http://localhost:${process.env.PORT || 5000}/api/v1`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/modules/v1/*.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', apiRoutes);

app.get('/api/v1', (req, res) => {
  res.json({ 
    success: true,
    message: 'Prime Workforce API v1',
    endpoints: {
      auth: '/api/v1/auth',
      admin: '/api/v1/admin',
      client: '/api/v1/client',
      promoter: '/api/v1/promoter',
      docs: '/api-docs'
    }
  });
});

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[${process.env.NODE_ENV || 'development'}] Server running on port ${PORT}`);
    console.log(`API Base: http://localhost:${PORT}/api/v1`);
    console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);
    console.log(`Socket.IO: ws://localhost:${PORT}`);
  });
};

startServer();

export default app;