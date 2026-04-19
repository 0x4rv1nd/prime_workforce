import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map();
    this.initialize();
  }

  initialize() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.user = user;
        socket.userId = user._id.toString();
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  handleConnection(socket) {
    console.log(`[SOCKET] User connected: ${socket.user.name} (${socket.user.role})`);

    this.connectedUsers.set(socket.userId, socket.id);

    socket.join(`user:${socket.userId}`);
    socket.join(`role:${socket.user.role}`);

    socket.emit('connected', {
      userId: socket.userId,
      role: socket.user.role,
      message: 'Connected successfully'
    });

    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] User disconnected: ${socket.user.name} (${reason})`);
      this.connectedUsers.delete(socket.userId);
    });

    socket.on('error', (error) => {
      console.error(`[SOCKET] Error: ${error.message}`);
    });
  }

  emitToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  emitToRole(role, event, data) {
    this.io.to(`role:${role}`).emit(event, data);
  }

  emitToRoles(roles, event, data) {
    roles.forEach(role => this.emitToRole(role, event, data));
  }

  broadcastToAdmins(event, data) {
    this.emitToRole('ADMIN', event, data);
    this.emitToRole('SUPER_ADMIN', event, data);
  }

  async sendNotification(userId, title, message, type = 'SYSTEM', data = null) {
    try {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data
      });

      this.emitToUser(userId, 'notification', {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data,
        createdAt: notification.createdAt
      });

      return notification;
    } catch (error) {
      console.error(`[SOCKET] Failed to send notification: ${error.message}`);
      return null;
    }
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }
}

let socketManager = null;

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  socketManager = new SocketManager(io);
  console.log('[SOCKET] Socket.IO initialized');

  return socketManager;
};

export const getSocketManager = () => socketManager;

export default { initializeSocket, getSocketManager };