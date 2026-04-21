# AGENTS.md - Prime Workforce

## Run Commands

```bash
npm start        # Production: node src/index.js
npm run dev     # Watch mode: node --watch src/index.js
```

**API prefix**: `/api/v1`  
**Auth endpoint**: `/auth` (rate limited)  
**Swagger**: `/api-docs`  

## Architecture

- **Entry**: `src/index.js`
- **Routes**: `src/modules/v1/*.js` (auth, admin, client, promoter)
- **Models**: `src/models/*.js`
- **Middleware**: `src/middlewares/` (auth, validation, security, errorHandler)
- **Config**: `src/config/` (database.js, autoSeed.js)

## Database

- MongoDB via Mongoose (URI in `.env`)
- Auto-seeds admin user on startup via `src/config/autoSeed.js`
- Phase 1 schema doc: `PHASE1.md`

## Roles

`ADMIN | CLIENT | PROMOTER`

## Key Constraints

- Rate limiting on `/auth` routes
- CORS controlled via `CORS_ORIGIN` env var (comma-separated)
- JWT expires in 30 days (`JWT_EXPIRES_IN`)
- File uploads served static from `/uploads`

## Testing

Uses `mongodb-memory-server` for test DB isolation.