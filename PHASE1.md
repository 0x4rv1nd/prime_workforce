# Phase 1 Complete: Database Schema

## Prisma Schema Created: `prisma/schema.prisma`

### Model Relationships

| Model | Relations |
|-------|-----------|
| **User** | 1:1 → Client, 1:M → Assignments, Attendances, Availabilities, ActivityLogs |
| **Client** | 1:1 → User (owner), 1:M → Jobs |
| **Job** | M:1 → Client, 1:M → Assignments, Attendances |
| **Assignment** | M:1 → User, M:1 → Job (composite unique on userId+jobId) |
| **Attendance** | M:1 → User, M:1 → Job |
| **Availability** | M:1 → User (unique on userId+date) |
| **ActivityLog** | M:1 → User |

### Key Design Decisions

1. **User-Role enum**: ADMIN, CLIENT, WORKER with default WORKER
2. **isApproved**: Boolean flag for worker approval (default false)
3. **Location stored as**: latitude, longitude (Float) + location (String address)
4. **Assignment**: Many-to-many via junction table with composite unique constraint
5. **Attendance**: Stores both check-in/out GPS coordinates for geofencing

**Ready for Phase 2 → Backend Setup**