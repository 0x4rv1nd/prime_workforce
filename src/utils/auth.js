import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is required. Server cannot start without it.');
}

if (!/^\d+[dhms]$/.test(JWT_EXPIRES_IN)) {
  throw new Error('CRITICAL: JWT_EXPIRES_IN must be in format like 7d, 24h, 60m, 3600s');
}

export const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token has expired');
    }
    return decoded;
  } catch (error) {
    if (error.message === 'Token has expired') throw error;
    throw new Error('Invalid token');
  }
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateAdminToken = (adminId) => {
  return jwt.sign(
    { id: adminId, role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};