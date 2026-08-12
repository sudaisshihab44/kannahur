# Authentication Refactor Implementation Guide

## 🔐 Overview

This guide details the enhanced authentication system with JWT tokens, refresh tokens, RBAC, session management, password hashing, audit logging, and device tracking.

**Key Features:**
- ✅ JWT access & refresh tokens
- ✅ Secure password hashing (bcrypt)
- ✅ Role-based access control (RBAC)
- ✅ Session management with device tracking
- ✅ Comprehensive audit logging
- ✅ Security event monitoring
- ✅ Brute force protection
- ✅ HTTP-only secure cookies
- ✅ **100% Backward Compatible** with existing API

---

## 📋 Prerequisites

1. Run database migration: `migrations/006_add_authentication_tables.sql`
2. Install dependencies: `jsonwebtoken`, `bcrypt`, `uuid`, `cookie` (already installed)
3. Set environment variables in `.env`

---

## 🔧 Step 1: Environment Configuration (5 minutes)

Create or update `.env.local`:

```bash
# JWT Secrets (CHANGE IN PRODUCTION!)
JWT_ACCESS_SECRET=your-super-secret-access-key-change-me
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-me

# JWT Expiration
JWT_ACCESS_EXPIRES=15m      # Access token: 15 minutes
JWT_REFRESH_EXPIRES=7d      # Refresh token: 7 days

# Cookie Settings
COOKIE_DOMAIN=                # Optional: '.yourdomain.com'
NODE_ENV=production           # 'production' or 'development'

# Security
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
MAX_CONCURRENT_SESSIONS=3

# Application URL (for links in emails)
APP_URL=http://localhost:5173
```

**⚠️ IMPORTANT:**
- Generate strong random secrets for production:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Never commit secrets to git
- Use environment variables in production

---

## 🗄️ Step 2: Run Database Migration (2 minutes)

```bash
# In Supabase SQL Editor, run:
migrations/006_add_authentication_tables.sql
```

**This creates:**
- `refresh_tokens` — JWT refresh token storage
- `user_sessions` — Active session tracking
- `auth_audit_log` — All authentication events
- `security_events` — Security incidents
- `device_fingerprints` — Known devices
- Helper functions for session management

**Verify migration:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN (
  'refresh_tokens', 
  'user_sessions', 
  'auth_audit_log', 
  'security_events', 
  'device_fingerprints'
);
```

---

## 🔄 Step 3: Migrate Existing Passwords (10 minutes)

**Create migration script:**

```typescript
// scripts/migrate-passwords.ts
import { supabase } from '../api/config/supabase.js';
import { hashPassword } from '../api/utils/passwordUtils.js';

async function migratePasswords() {
  // Fetch all users with plain text passwords
  const { data: users } = await supabase
    .from('users')
    .select('id, username, password')
    .is('password_hash', null);

  console.log(`Migrating ${users?.length || 0} user passwords...`);

  for (const user of users || []) {
    if (user.password) {
      const hash = await hashPassword(user.password);
      await supabase
        .from('users')
        .update({
          password_hash: hash,
          password: null, // Clear plain text
          password_changed_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      
      console.log(`✓ Migrated password for: ${user.username}`);
    }
  }

  console.log('✅ Password migration complete!');
}

migratePasswords();
```

**Run migration:**
```bash
npx tsx scripts/migrate-passwords.ts
```

---

## 🔌 Step 4: Update API Entry Points (30 minutes)

### 4.1 Update `api/index.ts` (Main Router)

**Add new auth endpoints:**

```typescript
import {
  enhancedLoginHandler,
  refreshTokenHandler,
  logoutHandler,
  verifyTokenHandler,
  getActiveSessionsHandler,
  revokeAllSessionsHandler,
} from './controllers/enhancedAuthController.js';
import { requireJwtAuth, requireJwtAdmin } from './middleware/jwtAuthMiddleware.js';

// ── POST /api/login (ENHANCED - backward compatible) ─────────────
if (path === '/api/login' && method === 'POST') {
  return wrapAsync(enhancedLoginHandler)(req, res);
}

// ── POST /api/auth/refresh (NEW) ──────────────────────────────────
if (path === '/api/auth/refresh' && method === 'POST') {
  return wrapAsync(refreshTokenHandler)(req, res);
}

// ── POST /api/logout (NEW) ────────────────────────────────────────
if (path === '/api/logout' && method === 'POST') {
  return wrapAsync(logoutHandler)(req, res);
}

// ── GET /api/auth/verify (NEW) ────────────────────────────────────
if (path === '/api/auth/verify' && method === 'GET') {
  return wrapAsync(verifyTokenHandler)(req, res);
}

// ── GET /api/auth/sessions (NEW) ──────────────────────────────────
if (path === '/api/auth/sessions' && method === 'GET') {
  if (!(await requireJwtAuth(req, res))) return;
  return wrapAsync(getActiveSessionsHandler)(req, res);
}

// ── POST /api/auth/sessions/revoke-all (NEW) ──────────────────────
if (path === '/api/auth/sessions/revoke-all' && method === 'POST') {
  if (!(await requireJwtAuth(req, res))) return;
  return wrapAsync(revokeAllSessionsHandler)(req, res);
}

// Update existing protected routes to use JWT auth
// Example: Replace requireAuth with requireJwtAuth
if (path === '/api/queue/pause' && method === 'POST') {
  if (!(await requireJwtAuth(req, res))) return; // NEW: JWT-based
  return wrapAsync(togglePauseHandler)(req, res);
}
```

### 4.2 Update `api/admin.ts` (Admin Router)

```typescript
import { requireJwtAdmin } from './middleware/jwtAuthMiddleware.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const { method } = req;
  const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';

  try {
    // Require JWT admin auth for ALL routes
    if (!(await requireJwtAdmin(req, res))) return;

    // ... rest of routes
  } catch (err: any) {
    // ... error handling
  }
}
```

---

## 🎨 Step 5: Update Frontend (1 hour)

### 5.1 Create Authentication Context

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: any;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string, portal: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken')
  );

  const login = async (username: string, password: string, portal: string) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, portal }),
      credentials: 'include', // Include cookies
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    // Store access token in memory and localStorage
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = async () => {
    if (accessToken) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include',
      });
    }

    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  };

  const refreshToken = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Sends refresh token cookie
      });

      const data = await response.json();

      if (data.success) {
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);
      } else {
        // Refresh failed, logout
        await logout();
      }
    } catch (error) {
      await logout();
    }
  };

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!accessToken) return;

    // Refresh 1 minute before expiry (14 min for 15 min token)
    const refreshInterval = setInterval(() => {
      refreshToken();
    }, 14 * 60 * 1000); // 14 minutes

    return () => clearInterval(refreshInterval);
  }, [accessToken]);

  // Restore session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!accessToken,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 5.2 Create API Client with Token Refresh

```typescript
// src/utils/apiClient.ts
const API_BASE = '';

async function apiClient(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const accessToken = localStorage.getItem('accessToken');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add JWT token if available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(API_BASE + endpoint, {
    ...options,
    headers,
    credentials: 'include', // Include cookies
  });

  // If token expired, try refresh
  if (response.status === 401) {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    const refreshData = await refreshResponse.json();

    if (refreshData.success) {
      // Retry original request with new token
      localStorage.setItem('accessToken', refreshData.accessToken);
      headers['Authorization'] = `Bearer ${refreshData.accessToken}`;

      response = await fetch(API_BASE + endpoint, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      // Refresh failed, redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return response.json();
}

export default apiClient;
```

### 5.3 Update Login Component

```typescript
// src/components/LoginScreen.tsx (updated)
import { useAuth } from '../contexts/AuthContext';

function LoginScreen() {
  const { login } = useAuth();
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(username, password, portal);
      // Redirect handled by routing
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  // ... rest of component
}
```

---

## 🧪 Step 6: Testing (30 minutes)

### 6.1 Test Login Flow

```bash
# Login and get tokens
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123","portal":"admin"}' \
  -c cookies.txt

# Response:
# {
#   "success": true,
#   "user": {...},
#   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "sessionId": "uuid",
#   "expiresIn": 900
# }
```

### 6.2 Test Protected Endpoint

```bash
# Use access token
curl -X GET http://localhost:5173/api/auth/verify \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Response:
# {
#   "valid": true,
#   "user": {...}
# }
```

### 6.3 Test Token Refresh

```bash
# Refresh token (uses cookie)
curl -X POST http://localhost:5173/api/auth/refresh \
  -b cookies.txt

# Response:
# {
#   "success": true,
#   "accessToken": "NEW_ACCESS_TOKEN",
#   "expiresIn": 900
# }
```

### 6.4 Test Logout

```bash
curl -X POST http://localhost:5173/api/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt
```

### 6.5 Test Backward Compatibility

```bash
# Old API still works with x-operator-username header
curl -X POST http://localhost:5173/api/queue/pause \
  -H "x-operator-username: admin"

# Should work! ✅
```

---

## 🔒 Security Features

### 1. Password Hashing
- Bcrypt with 12 rounds (configurable)
- Automatic upgrade from plain text passwords
- Password strength validation

### 2. Brute Force Protection
- Max 5 failed attempts (configurable)
- 15-minute account lockout
- Automatic unlock after timeout

### 3. Session Management
- Max 3 concurrent sessions (configurable)
- 24-hour session timeout
- Device fingerprinting

### 4. Token Security
- Short-lived access tokens (15 min)
- Long-lived refresh tokens (7 days)
- HTTP-only secure cookies
- Token revocation support

### 5. Audit Logging
- All login attempts logged
- Failed login tracking
- Security events logged
- IP address and device tracking

### 6. Device Tracking
- Known device detection
- Unusual device alerts
- Device fingerprinting

---

## 📊 Monitoring Queries

### Check Active Sessions
```sql
SELECT 
  u.username,
  s.device_name,
  s.ip_address,
  s.created_at,
  s.last_active_at
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = TRUE
ORDER BY s.last_active_at DESC;
```

### Check Failed Login Attempts
```sql
SELECT 
  username,
  COUNT(*) as failed_attempts,
  MAX(timestamp) as last_attempt
FROM auth_audit_log
WHERE action = 'login_failed'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY username
HAVING COUNT(*) >= 3
ORDER BY failed_attempts DESC;
```

### Check Security Events
```sql
SELECT 
  event_type,
  severity,
  COUNT(*) as count
FROM security_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY event_type, severity
ORDER BY count DESC;
```

### Cleanup Old Data
```sql
-- Run monthly
SELECT * FROM cleanup_old_auth_data();
```

---

## 🔄 Migration Strategy

### Phase 1: Deploy New System (Week 1)
1. Run database migration
2. Deploy enhanced auth endpoints
3. Keep old auth working (x-operator-username)
4. No frontend changes yet

### Phase 2: Update Frontend (Week 2)
1. Add JWT authentication to new features
2. Gradually migrate existing features
3. Both auth methods work in parallel

### Phase 3: Full Migration (Week 3-4)
1. All new logins use JWT
2. Old sessions still work via legacy header
3. Deprecation notice for legacy auth

### Phase 4: Remove Legacy (Month 2)
1. Force re-login for all users
2. Remove x-operator-username support
3. JWT-only authentication

---

## 🐛 Troubleshooting

### Issue: "Invalid or expired token"
**Cause:** Access token expired
**Solution:** Frontend should auto-refresh using `/api/auth/refresh`

### Issue: "Account temporarily locked"
**Cause:** Too many failed login attempts
**Solution:** Wait 15 minutes or admin can manually unlock:
```sql
UPDATE users 
SET locked_until = NULL, failed_login_attempts = 0 
WHERE username = 'username';
```

### Issue: Cookies not being set
**Cause:** CORS or secure cookie settings
**Solution:** 
- Check `COOKIE_DOMAIN` in `.env`
- Ensure `credentials: 'include'` in fetch requests
- Use HTTPS in production

### Issue: Session expired immediately
**Cause:** Server time mismatch or incorrect JWT config
**Solution:**
- Verify server time: `date`
- Check JWT expiration settings in `.env`

---

## 📚 API Reference

### POST /api/login
**Enhanced** - Returns JWT tokens + user data

**Request:**
```json
{
  "username": "admin",
  "password": "Admin@123",
  "portal": "admin"
}
```

**Response:**
```json
{
  "success": true,
  "user": {...},
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "sessionId": "uuid",
  "expiresIn": 900
}
```

### POST /api/auth/refresh
**New** - Refresh access token

**Request:** (refresh token in cookie or body)

**Response:**
```json
{
  "success": true,
  "accessToken": "NEW_TOKEN",
  "expiresIn": 900
}
```

### POST /api/logout
**New** - Logout and revoke tokens

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true
}
```

### GET /api/auth/verify
**New** - Verify token validity

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "valid": true,
  "user": {...}
}
```

### GET /api/auth/sessions
**New** - Get active sessions

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "uuid",
      "device_name": "Chrome on Windows 10",
      "ip_address": "192.168.1.1",
      "created_at": "2026-07-27T10:00:00Z",
      "is_current": true
    }
  ]
}
```

---

## ✅ Checklist

- [ ] Run migration `006_add_authentication_tables.sql`
- [ ] Install npm packages
- [ ] Configure `.env` variables
- [ ] Migrate existing passwords to bcrypt
- [ ] Update API entry points with new routes
- [ ] Update frontend authentication
- [ ] Test login flow with JWT
- [ ] Test token refresh
- [ ] Test logout
- [ ] Test backward compatibility
- [ ] Configure monitoring
- [ ] Set up cleanup cron jobs

---

**Total implementation time:** 4-6 hours  
**Risk level:** Low (fully backward compatible)  
**Security improvement:** **Production-grade authentication** 🔒
