# Prime Workforce API - System Audit Report

**Date:** April 19, 2026
**Status:** PHASES 1-6 COMPLETE | PHASES 7-8 PENDING

---

## 1. Executive Summary

### Project Overview
Production-grade Workforce Management System built with:
- **Backend:** Node.js + Express
- **Database:** MongoDB + Mongoose
- **Authentication:** JWT with role-based access control
- **API Documentation:** Swagger/OpenAPI 3.0
- **API Versioning:** `/api/v1`

### Completed Phases
| Phase | Description | Status |
|-------|------------|--------|
| 1 | Database Design (MongoDB models) | ✅ Complete |
| 2 | Backend Setup | ✅ Complete |
| 3 | Auth Module | ✅ Complete |
| 4 | User & Client Module | ✅ Complete |
| 5 | Job + Assignment Module | ✅ Complete |
| 6 | Attendance Module | ✅ Complete |
| 7 | Reports Module | 🔶 Partially Complete |
| 8 | Frontend (Next.js) | ⏳ Not Started |

---

## 2. Architecture

### Directory Structure
```
/src
├── index.js                    # Main server entry
├── config/
│   └── database.js            # MongoDB connection
├── models/
│   ├── User.js               # User model with roles
│   ├── Client.js              # Client model
│   ├── Job.js                # Job model with geofencing
│   ├── Assignment.js         # Assignment model
│   ├── Attendance.js         # Attendance with check-in/out
│   ├── Availability.js       # Worker availability
│   ├── ActivityLog.js       # Audit logging
│   └── Payment.js            # (Future) Payments
├── middlewares/
│   ├── auth.js              # JWT auth & authorization
│   ├── validation.js        # Zod validation schemas
│   ├── security.js          # Helmet & rate limiting
│   ├── logger.js           # Request logging
│   └── errorHandler.js      # Error handling
├── utils/
│   └── auth.js            # Token generation, password hashing
├── modules/
│   ├── v1.js              # Main router (/api/v1)
│   ├── v1/
│   │   ├── auth.js         # Auth endpoints
│   │   ├── admin.js        # Admin endpoints
│   │   ├── client.js      # Client endpoints
│   │   └── worker.js     # Worker endpoints
│   └── (legacy routes)     # Old route files (not used)
└── scripts/
    ├── seed-admin.js
    └── seed-test-data.js
```

---

## 3. Database Models

### 3.1 User Model
**File:** `src/models/User.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| name | String | required, trim, max: 100 | Full name |
| email | String | required, unique, lowercase | Email address |
| password | String | required, min: 6 | Hashed password |
| role | Enum | SUPER_ADMIN, ADMIN, CLIENT, WORKER | User role |
| isApproved | Boolean | default: false | Approval status |
| phone | String | optional | Contact phone |
| profileImage | String | optional | Profile image URL |
| createdAt | Date | auto | Creation timestamp |
| updatedAt | Date | auto | Last update |

**Indexes:**
- `{ role: 1, isApproved: 1 }`
- `{ createdAt: -1 }`
- Single: `email` (unique)

**Issues:**
- ⚠️ Line 17: `index: true` on role field is redundant with compound index on line 30

### 3.2 Client Model
**File:** `src/models/Client.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userId | ObjectId | required, unique, ref: User | Link to user |
| companyName | String | required | Company name |
| contactEmail | String | required, unique | Contact email |
| contactPhone | String | optional | Contact phone |
| companyAddress | Object | nested | Address fields |
| industry | String | optional | Industry type |
| createdAt | Date | auto | Creation timestamp |

**Indexes:**
- `{ companyName: 'text' }`
- `{ contactEmail: 1 }` (unique)

### 3.3 Job Model
**File:** `src/models/Job.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| title | String | required, trim | Job title |
| description | String | required, max: 2000 | Job description |
| location | Object | lat/lng required | Geofencing data |
| - address | String | optional | Location address |
| - lat, lng | Number | required | Coordinates |
| - radius | Number | default: 500m | Geofence radius |
| clientId | ObjectId | required, ref: Client | Client reference |
| startDate, endDate | Date | required | Job dates |
| status | Enum | PENDING, ACTIVE, COMPLETED, CANCELLED | Job status |
| wage | Object | nested | Wage configuration |
| - amount | Number | required, min: 0 | Wage amount |
| - currency | String | default: USD | Currency |
| - type | Enum | HOURLY, DAILY, FIXED | Wage type |
| requiredWorkers | Number | default: 1 | Workers needed |
| skills | Array | String | Required skills |

**Indexes:**
- `{ clientId: 1, status: 1 }`
- `{ startDate: 1, endDate: 1 }`
- `{ title: 'text', description: 'text' }`

### 3.4 Assignment Model
**File:** `src/models/Assignment.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userId | ObjectId | required, ref: User | Worker reference |
| jobId | ObjectId | required, ref: Job | Job reference |
| assignedBy | ObjectId | ref: User | Who assigned |
| assignedAt | Date | auto | Assignment time |
| status | Enum | PENDING, ACTIVE, COMPLETED, CANCELLED | Status |
| startedAt | Date | optional | When started |
| completedAt | Date | optional | When completed |

**Indexes:**
- `{ userId: 1, jobId: 1 }` (unique)
- `{ jobId: 1, status: 1 }`

### 3.5 Attendance Model
**File:** `src/models/Attendance.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userId | ObjectId | required, ref: User | Worker reference |
| jobId | ObjectId | required, ref: Job | Job reference |
| assignmentId | ObjectId | required, ref: Assignment | Assignment link |
| date | Date | required | Attendance date |
| checkIn | Object | nested | Check-in data |
| - time | Date | optional | Check-in time |
| - location | Object | lat/lng | GPS location |
| - verified | Boolean | default: false | Geofence verified |
| - notes | String | optional | Notes |
| checkOut | Object | nested | Check-out data |
| - time | Date | optional | Check-out time |
| - location | Object | lat/lng | GPS location |
| - verified | Boolean | default: false | Geofence verified |
| - notes | String | optional | Notes |
| totalHours | Number | default: 0 | Total hours worked |
| status | Enum | PRESENT, ABSENT, LATE, EARLY_LEAVE | Attendance status |
| overtime | Number | default: 0 | Overtime hours |
| breakDuration | Number | default: 0 | Break in minutes |

**Indexes:**
- `{ userId: 1, date: 1 }` (unique)
- `{ jobId: 1, date: 1 }`
- `{ assignmentId: 1 }`

### 3.6 Availability Model
**File:** `src/models/Availability.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userId | ObjectId | required, ref: User | Worker reference |
| date | Date | required | Availability date |
| isAvailable | Boolean | default: true | Available flag |
| shift | Object | nested | Shift times |
| - start | String | "09:00" format | Shift start |
| - end | String | "17:00" format | Shift end |
| reason | String | optional | Unavailability reason |

**Indexes:**
- `{ userId: 1, date: 1 }` (unique)

### 3.7 ActivityLog Model
**File:** `src/models/ActivityLog.js`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| userId | ObjectId | required, ref: User | User reference |
| action | String | required | Action type |
| entityType | String | optional | Related entity |
| entityId | ObjectId | optional | Entity ID |
| details | Mixed | optional | Additional data |
| ipAddress | String | optional | Request IP |
| userAgent | String | optional | Request UA |
| timestamp | Date | auto | Log timestamp |

**Indexes:**
- `{ userId: 1, timestamp: -1 }`
- `{ action: 1, timestamp: -1 }`

---

## 4. API Endpoints

### 4.1 Base Configuration
- **API Base:** `/api/v1`
- **Server Port:** `5000` (default)
- **Swagger Docs:** `/api-docs`

### 4.2 Auth Endpoints
**File:** `src/modules/v1/auth.js`

| Method | Endpoint | Description | Auth | Role |
|--------|----------|------------|------|------|
| POST | /auth/register | Register worker | Public | - |
| POST | /auth/login | Login user | Public | - |
| GET | /auth/me | Get current user | JWT | All |
| POST | /auth/logout | Logout user | JWT | All |

**Request/Response Format:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": { ... }
}
```

### 4.3 Admin Endpoints
**File:** `src/modules/v1/admin.js`

**Routes:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /admin/users | List all users |
| GET | /admin/users/:id | Get user |
| PATCH | /admin/users/:id/approve | Approve worker |
| PATCH | /admin/users/:id/reject | Reject worker |
| DELETE | /admin/users/:id | Delete user |
| POST | /admin/clients | Create client |
| GET | /admin/clients | List clients |
| GET | /admin/clients/:id | Get client |
| GET | /admin/jobs | List jobs |
| GET | /admin/jobs/:id | Get job |
| POST | /admin/assignments | Assign workers |
| GET | /admin/assignments | List assignments |
| GET | /admin/reports/daily | Daily report |
| GET | /admin/reports/weekly | Weekly report |
| GET | /admin/reports/monthly | Monthly report |

**Access:** `/api/v1/admin/*` - Requires JWT + `SUPER_ADMIN` or `ADMIN` role

### 4.4 Client Endpoints
**File:** `src/modules/v1/client.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /client/profile | Get profile |
| POST | /client/jobs | Create job |
| GET | /client/jobs | List jobs |
| GET | /client/jobs/:id | Get job |
| PUT | /client/jobs/:id | Update job |
| DELETE | /client/jobs/:id | Delete job |
| GET | /client/workers | List workers |
| GET | /client/attendance | Get attendance |
| GET | /client/attendance/:userId | Get worker attendance |

**Access:** `/api/v1/client/*` - Requires JWT + `CLIENT` role

### 4.5 Worker Endpoints
**File:** `src/modules/v1/worker.js`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /worker/profile | Get profile |
| PUT | /worker/profile | Update profile |
| POST | /worker/availability | Set availability |
| GET | /worker/availability | Get availability |
| GET | /worker/jobs | Get assigned jobs |
| GET | /worker/jobs/:id | Get job details |
| POST | /worker/attendance/check-in | Check in |
| POST | /worker/attendance/check-out | Check out |
| GET | /worker/attendance | Get attendance |

**Access:** `/api/v1/worker/*` - Requires JWT + `WORKER` role

**Special Features:**
- Geofencing validation on check-in (`src/modules/v1/worker.js:304`)
- Distance calculation using Haversine formula (`src/modules/v1/worker.js:15-30`)

---

## 5. Authentication & Authorization

### 5.1 JWT Configuration
**File:** `src/utils/auth.js`

```javascript
// Token generation
jwt.sign(
  { id, email, role },
  JWT_SECRET,
  { expiresIn: '7d' }
);
```

- **Algorithm:** HS256
- **Secret:** Environment variable `JWT_SECRET` (default: 'default_secret')
- **Expiry:** 7 days (default)

### 5.2 Middleware
**File:** `src/middlewares/auth.js`

| Function | Purpose |
|----------|---------|
| `auth` | JWT verification, attaches user to request |
| `authorize(...roles)` | Role-based access control |
| `requireApproval` | Check if user is approved |

**Role Hierarchy:**
1. SUPER_ADMIN (full access)
2. ADMIN (managed users, jobs, reports)
3. CLIENT (own jobs, workers)
4. WORKER (own profile, assignments)

---

## 6. Security

### 6.1 Middleware
**File:** `src/middlewares/security.js`

- **Helmet:** HTTP headers protection
- **Rate Limiting:**
  - Auth routes: 10 requests/15min
  - General: 100 requests/15min
- **CORS:** Enabled

---

## 7. Validation

**File:** `src/middlewares/validation.js`

Uses Zod schema validation for:
- Registration
- Login
- Create client
- Create job
- Assign worker
- Check-in/out

---

## 8. Issues & Recommendations

### 8.1 Issues Found

| Severity | Location | Issue |
|----------|----------|-------|
| ⚠️ Low | User.js:17 | Duplicate index on role field |
| ⚠️ Low | User.js:17 & 30 | `index: true` on role + compound index |
| 🔶 Minor | User.js:4 | No default export |

### 8.2 Recommendations

1. **Remove redundant index** in User.js line 17
2. **Add input sanitization** for user-provided content
3. **Implement refresh tokens** for better auth flow
4. **Add request validation** on all admin endpoints
5. **Clean up legacy route files** in `src/modules/`
6. **Add unit tests** for core functionality

---

## 9. Reports Module Status

**Location:** `src/modules/v1/admin.js:581-701`

Partially implemented:
- ✅ Daily report (`/admin/reports/daily`)
- ✅ Weekly report (`/admin/reports/weekly`)
- ✅ Monthly report (`/admin/reports/monthly`)

**Current Output:**
- Total check-ins
- Total hours worked
- Raw attendance records

**Enhancements Needed:**
- Group by client/job
- Filter by worker
- Summary statistics
- Export to CSV/PDF

---

## 10. Testing Results

**Last Test Date:** April 2026

All refactored `/api/v1` endpoints tested:
- ✅ Login returns JWT token
- ✅ Admin endpoints protected by role
- ✅ Role-based access working
- ✅ Standard response format: `{success, message, data}`

---

## 11. Future Work

### Phase 7: Reports Module
- Enhanced filtering (date range, client, worker)
- Aggregated statistics
- Export capabilities
- Dashboard summaries

### Phase 8: Frontend
- Next.js application
- Authentication pages
- Admin dashboard
- Client portal
- Worker mobile-friendly interface

---

## Appendix A: Dependencies

**package.json**
```json
{
  "express": "^4.x",
  "mongoose": "^8.x",
  "jsonwebtoken": "^9.x",
  "bcryptjs": "^2.x",
  "swagger-ui-express": "^5.x",
  "swagger-jsdoc": "^6.x",
  "cors": "^2.x",
  "dotenv": "^16.x",
  "helmet": "^7.x",
  "express-rate-limit": "^7.x",
  "zod": "^3.x"
}
```

---

## Appendix B: Environment Variables

```
PORT=5000
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/prime_workforce
```

---

*End of Audit Report*