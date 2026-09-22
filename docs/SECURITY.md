# InclusyQ Security Documentation

## 🔒 Security Overview

InclusyQ implements comprehensive enterprise-grade security measures to protect against common web vulnerabilities and attacks. This document outlines all security features, configurations, and best practices.

---

## 📋 Table of Contents

1. [Security Features](#security-features)
2. [Security Headers](#security-headers)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [Output Sanitization](#output-sanitization)
6. [SQL Injection Protection](#sql-injection-protection)
7. [XSS Protection](#xss-protection)
8. [CSRF Protection](#csrf-protection)
9. [CORS Configuration](#cors-configuration)
10. [Environment Validation](#environment-validation)
11. [Authentication Security](#authentication-security)
12. [API Endpoint Security](#api-endpoint-security)
13. [Security Monitoring](#security-monitoring)
14. [Security Best Practices](#security-best-practices)
15. [Vulnerability Disclosure](#vulnerability-disclosure)

---

## 🛡️ Security Features

### Implemented Security Layers

✅ **Layer 1: Network Security**
- HTTPS enforcement (Strict-Transport-Security header)
- CORS with origin validation
- DNS prefetch control

✅ **Layer 2: Request Security**
- Rate limiting (4 tiers: public, API, auth, sensitive)
- Request size limits
- Method validation

✅ **Layer 3: Authentication Security**
- JWT tokens (dual-token: access + refresh)
- Bcrypt password hashing (12 rounds)
- Brute force protection (account lockout)
- Device fingerprinting
- Session management (max 3 concurrent)

✅ **Layer 4: Input Security**
- Comprehensive input validation (20+ validators)
- SQL injection prevention (parameterized queries)
- XSS filtering
- Prototype pollution prevention

✅ **Layer 5: Output Security**
- Response sanitization (removes sensitive fields)
- XSS-safe HTML escaping
- Error message sanitization (no stack traces in production)

✅ **Layer 6: CSRF Protection**
- Origin/Referer validation
- SameSite cookies
- Custom header requirements

✅ **Layer 7: Security Headers**
- Content Security Policy (CSP)
- X-Frame-Options (clickjacking protection)
- X-Content-Type-Options (MIME sniffing protection)
- Permissions-Policy (feature restriction)

---

## 🛡️ Security Headers

### Implemented Headers

| Header | Value | Protection |
|--------|-------|------------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS protection (legacy browsers) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS |
| `Content-Security-Policy` | See below | Restricts resource loading |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Permissions-Policy` | See below | Restricts browser features |
| `X-DNS-Prefetch-Control` | `off` | Privacy protection |

### Content Security Policy (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https: blob:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

**Note:** `unsafe-inline` and `unsafe-eval` are permitted for development compatibility. Consider tightening in production.

### Permissions Policy

Disabled features:
- Geolocation
- Microphone
- Camera
- Payment
- USB
- Magnetometer
- Gyroscope
- Accelerometer

**Implementation:** `api/middleware/securityHeaders.ts`

---

## ⏱️ Rate Limiting

### Rate Limit Tiers

#### 1. Public Rate Limiter
- **Limit:** 200 requests per 15 minutes
- **Use:** Public endpoints (queue display, token tracking)
- **Endpoints:** `GET /api`, `GET /api/queue`, `GET /api/track/:id`

#### 2. API Rate Limiter
- **Limit:** 100 requests per 15 minutes
- **Use:** Standard authenticated API operations
- **Endpoints:** Most authenticated endpoints

#### 3. Auth Rate Limiter
- **Limit:** 5 requests per 15 minutes
- **Use:** Authentication endpoints (brute force prevention)
- **Endpoints:** `POST /api/login`, `POST /api/auth/refresh`

#### 4. Sensitive Rate Limiter
- **Limit:** 10 requests per 15 minutes
- **Use:** Admin and sensitive operations
- **Endpoints:** All `/api/admin/*`, `/api/upload/*`

### Rate Limit Headers

All rate-limited responses include:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T10:30:00Z
Retry-After: 900  (on 429 responses)
```

### Rate Limit Response (429)

```json
{
  "success": false,
  "message": "Too many requests, please try again later.",
  "retryAfter": 900
}
```

**Implementation:** `api/middleware/rateLimiter.ts`

---

## ✅ Input Validation

### Validation Functions

#### String Validation
- `sanitizeString()` - Remove dangerous characters
- `validateUsername()` - Alphanumeric + ._- only, 3-50 chars
- `validatePassword()` - 8-128 chars, no sanitization
- `validateEmail()` - RFC-compliant email validation
- `validateTextLength()` - Enforce min/max length

#### Numeric Validation
- `validateInteger()` - Parse and validate integers with min/max
- `validateLimit()` - Pagination limit validation
- `validateOffset()` - Pagination offset validation

#### Type Validation
- `validateUUID()` - UUID v4 format validation
- `validateEnum()` - Enum value validation
- `validateBoolean()` - Boolean coercion and validation
- `validateDate()` - ISO 8601 date validation
- `validateURL()` - URL format validation
- `validateJSON()` - Safe JSON parsing

#### Security Validation
- `validatePhoneNumber()` - Phone number format (10-15 digits)
- `sanitizeFilename()` - Prevent directory traversal
- `validateObjectKeys()` - Prevent prototype pollution
- `removeXSS()` - Strip XSS attempts from strings

### Validation Schemas

Request validation schemas for all endpoints:

```typescript
// Login request
validateLoginRequest(body) → {username, password, portal}

// Create patient
validateCreatePatientRequest(body) → {name, age, gender?, phone?, departmentId, priority?}

// Create token
validateCreateTokenRequest(body) → {patientId, departmentId, doctorId?, priority?}

// Admin operations
validateCreateDoctorRequest(body)
validateCreateDepartmentRequest(body)
validateCreateRoomRequest(body)
validateCreateStaffRequest(body)
validateUpdateQueueConfigRequest(body)
```

**Implementation:**
- `api/utils/validation.ts` - Validation functions
- `api/validators/schemas.ts` - Request schemas
- `api/middleware/validationMiddleware.ts` - Validation wrapper

---

## 🧹 Output Sanitization

### Automatic Sanitization

All API responses are automatically sanitized to prevent XSS attacks.

#### Sanitization Rules

1. **HTML Escaping** - All string values are HTML-escaped
2. **Sensitive Field Removal** - Passwords, secrets, tokens excluded
3. **Recursive Sanitization** - Nested objects and arrays
4. **Error Sanitization** - Stack traces removed in production

#### Excluded Fields

These fields are automatically excluded from responses:
- `password`
- `password_hash`
- `password_salt`
- `secret`
- `token` (refresh tokens)
- `api_key`
- `private_key`
- `salt`
- `failed_login_attempts`
- `locked_until`

#### User Object Sanitization

```typescript
// Before
{
  id: "123",
  username: "admin",
  password_hash: "...",  // ❌
  email: "admin@example.com",
  locked_until: "..."    // ❌
}

// After
{
  id: "123",
  username: "admin",
  email: "admin@example.com"
}
```

#### Error Sanitization

**Development:**
```json
{
  "success": false,
  "message": "duplicate key value violates unique constraint",
  "stack": "Error: ...\n    at ..."
}
```

**Production:**
```json
{
  "success": false,
  "message": "A database error occurred. Please contact support.",
  "code": "DATABASE_ERROR"
}
```

**Implementation:** `api/utils/sanitization.ts`

---

## 🛡️ SQL Injection Protection

### Protection Mechanisms

#### 1. Parameterized Queries (Primary Defense)

✅ **All database queries use Supabase query builder:**
```typescript
// ✅ Safe - Parameterized
await supabase
  .from('users')
  .select('*')
  .eq('username', userInput);  // Automatically escaped

// ❌ Dangerous - String interpolation
await supabase.rpc('raw_query', { 
  sql: `SELECT * FROM users WHERE username = '${userInput}'` 
});
```

#### 2. SQL Injection Detection

Pattern-based detection for dangerous SQL keywords:
- `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `UNION`, `EXEC`
- Comment sequences: `--`, `/* */`
- Hex notation: `0x...`
- Time-based attacks: `WAITFOR DELAY`, `SLEEP(`, `BENCHMARK`

#### 3. Input Validation

All user inputs are validated before database operations:
```typescript
// Validate column names (prevent injection)
validateTableName(tableName);  // Only alphanumeric + underscore
validateColumnName(column);    // Only alphanumeric + underscore

// Sanitize ORDER BY clauses
const safeOrderBy = sanitizeOrderBy(userInput);
```

#### 4. Safe Query Builder

Use `SafeQueryBuilder` for complex queries:
```typescript
import { SafeQueryBuilder } from './utils/sqlProtection.js';

// Safe equality filter
SafeQueryBuilder.eq(query, 'username', userInput);

// Safe LIKE filter (automatically escapes wildcards)
SafeQueryBuilder.like(query, 'name', userInput);

// Safe IN filter
SafeQueryBuilder.in(query, 'status', ['active', 'pending']);
```

**Implementation:**
- `api/utils/sqlProtection.ts` - SQL protection utilities
- All repositories use Supabase query builder (verified)

---

## 🚫 XSS Protection

### Protection Layers

#### 1. Input Filtering
```typescript
// Remove script tags
cleaned = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

// Remove event handlers
cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

// Remove javascript: protocols
cleaned = cleaned.replace(/javascript:/gi, '');
```

#### 2. HTML Entity Escaping
```typescript
// Before
const userInput = '<script>alert("XSS")</script>';

// After sanitization
const safe = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
```

#### 3. Content Security Policy
CSP headers prevent inline script execution and restrict resource loading.

#### 4. X-XSS-Protection Header
Legacy browser XSS filter enabled in block mode.

**Implementation:** `api/utils/validation.ts` (removeXSS function)

---

## 🔐 CSRF Protection

### Protection Mechanisms

#### 1. Origin/Referer Validation
```typescript
// Validate request origin
const origin = req.headers.origin || req.headers.referer;
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.COOKIE_DOMAIN,
  'http://localhost:3000',
  'http://localhost:5173',
];

// Reject if origin doesn't match
if (!isAllowedOrigin(origin, allowedOrigins)) {
  return 403; // Forbidden
}
```

#### 2. SameSite Cookies
```typescript
// Refresh token cookie
res.setHeader('Set-Cookie', [
  `refreshToken=${token}; ` +
  `HttpOnly; ` +
  `Secure; ` +
  `SameSite=Strict; ` +  // ← CSRF protection
  `Path=/; ` +
  `Max-Age=604800`
]);
```

#### 3. Custom Headers
APIs require custom headers that browsers can't send cross-origin:
- `Authorization: Bearer <token>` - JWT authentication
- `x-requested-with: XMLHttpRequest` - AJAX indicator
- `x-api-key` - API key (if applicable)

#### 4. Token-Based Authentication
JWT tokens in `Authorization` header provide CSRF protection since:
- Tokens are not automatically sent by the browser
- Attacker can't access tokens via JavaScript (if stored properly)

### CSRF Enforcement

**Strict Mode (Optional):**
Set `STRICT_CSRF=true` in environment to reject all requests without proper headers.

**Default Mode (Lenient):**
Allows requests with JWT tokens or custom headers (backward compatible).

**Implementation:** `api/middleware/csrfProtection.ts`

---

## 🌐 CORS Configuration

### Allowed Origins

By default, CORS allows:
- Same origin
- `http://localhost:3000` (development)
- `http://localhost:5173` (Vite dev server)
- Custom origins from `FRONTEND_URL` environment variable

### CORS Headers

```
Access-Control-Allow-Origin: <origin>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

### Preflight Requests

All preflight (`OPTIONS`) requests are handled automatically and return 204 No Content.

**Implementation:** `api/middleware/corsMiddleware.ts`

---

## ⚙️ Environment Validation

### Required Variables

```env
# Supabase (required)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# JWT Secrets (required)
JWT_ACCESS_SECRET=<32+ characters>
JWT_REFRESH_SECRET=<32+ characters, different from access>

# JWT Expiration (optional)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Environment (optional)
NODE_ENV=production
```

### Validation Rules

✅ **On Startup:**
1. All required variables must be present
2. JWT secrets must be at least 32 characters
3. JWT secrets must be different
4. Supabase URL must be valid URL format
5. Supabase key must be at least 20 characters

⚠️ **Warnings:**
- JWT secret appears to be default value
- JWT secret is less than 32 characters (in production)
- Cookie domain not set (in production)
- Cookie secure flag not enabled (in production)

❌ **Errors (startup fails):**
- Missing required environment variable
- JWT secrets are identical
- Invalid URL format for Supabase URL

**Implementation:** `api/utils/envValidation.ts`

---

## 🔑 Authentication Security

### Password Security

**Hashing:**
- Algorithm: bcrypt
- Cost factor: 12 rounds
- Salt: Automatically generated per password

**Password Requirements:**
- Minimum length: 8 characters
- Maximum length: 128 characters
- No character restrictions (supports special characters)

### JWT Token Security

**Access Token:**
- Expiration: 15 minutes (default)
- Storage: Memory or localStorage (client-side)
- Transmission: `Authorization: Bearer <token>` header

**Refresh Token:**
- Expiration: 7 days (default)
- Storage: HTTP-only cookie (XSS-safe)
- Attributes: `HttpOnly`, `Secure`, `SameSite=Strict`

### Brute Force Protection

**Account Lockout:**
- Failed attempts: 5
- Lockout duration: 15 minutes
- Counter reset: After successful login

**Example:**
```
Attempt 1-4: Login allowed
Attempt 5: Account locked for 15 minutes
```

### Session Management

**Limits:**
- Maximum concurrent sessions: 3 per user
- Oldest session automatically revoked when limit exceeded

**Session Tracking:**
- Device fingerprint (IP + User-Agent)
- Last activity timestamp
- Device name, browser, OS

### Device Fingerprinting

**Tracked Information:**
- IP address
- User agent (browser, OS, device)
- First seen timestamp
- Last seen timestamp
- Trusted device flag

---

## 🔒 API Endpoint Security

### Security Matrix

| Endpoint | Rate Limit | Auth | CSRF | Validation |
|----------|------------|------|------|------------|
| `GET /api` | Public | ❌ | ❌ | ❌ |
| `POST /api/login` | Auth | ❌ | ❌ | ✅ |
| `POST /api/logout` | API | ✅ | ✅ | ❌ |
| `POST /api/auth/refresh` | Auth | Cookie | ❌ | ❌ |
| `GET /api/auth/verify` | API | ✅ | ❌ | ❌ |
| `GET /api/auth/sessions` | API | ✅ | ❌ | ❌ |
| `POST /api/auth/sessions/revoke-all` | API | ✅ | ✅ | ❌ |
| `GET /api/data` | API | ❌ | ❌ | ❌ |
| `GET /api/queue` | Public | ❌ | ❌ | ❌ |
| `POST /api/queue/pause` | API | ✅ | ✅ | ❌ |
| `POST /api/announcements` | API | ✅ | ✅ | ✅ |
| `DELETE /api/announcements/:id` | API | ✅ | ✅ | ❌ |
| `POST /api/patients` | API | ✅ | ✅ | ✅ |
| `GET /api/devices` | API | ✅ | ❌ | ❌ |
| `POST /api/devices` | API | ✅ | ✅ | ✅ |
| `POST /api/devices/assign` | API | ✅ | ✅ | ✅ |
| `POST /api/devices/unassign` | API | ✅ | ✅ | ❌ |
| `GET /api/track/:id` | Public | ❌ | ❌ | ❌ |
| `POST /api/tokens` | API | ✅ | ✅ | ✅ |
| `POST /api/tokens/:id/:action` | API | ✅ | ✅ | ❌ |
| `POST /api/admin/*` | Sensitive | Admin | ✅ | ✅ |
| `PUT /api/admin/*` | Sensitive | Admin | ✅ | ✅ |
| `DELETE /api/admin/*` | Sensitive | Admin | ✅ | ❌ |
| `POST /api/upload/*` | Sensitive | Admin | ✅ | ✅ |

### Endpoint Documentation

See the JWT Token Security and API Endpoint Security sections in this file for detailed endpoint documentation.

---

## 📊 Security Monitoring

### Audit Logging

All authentication events are logged to `auth_audit_log`:
```sql
SELECT 
  username,
  action,
  success,
  ip_address,
  user_agent,
  timestamp
FROM auth_audit_log
ORDER BY timestamp DESC;
```

**Logged Actions:**
- `login_success` - Successful login
- `login_failed` - Failed login attempt
- `logout` - User logout
- `token_refresh` - Token refresh
- `session_created` - New session
- `session_ended` - Session ended

### Security Events

Critical security events logged to `security_events`:
```sql
SELECT 
  event_type,
  severity,
  user_id,
  ip_address,
  metadata,
  timestamp
FROM security_events
WHERE severity IN ('high', 'critical')
ORDER BY timestamp DESC;
```

**Event Types:**
- `brute_force_attempt` - Multiple failed logins
- `suspicious_device` - Login from unknown device
- `account_locked` - Account locked due to failed attempts
- `unusual_activity` - Suspicious behavior detected

### Monitoring Queries

**Check Failed Login Attempts:**
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

**Check Active Sessions:**
```sql
SELECT 
  u.username,
  COUNT(*) as session_count,
  array_agg(s.device_name) as devices
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = TRUE
GROUP BY u.username
HAVING COUNT(*) > 1;
```

**Check Security Events (Last 24 Hours):**
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

---

## 🎯 Security Best Practices

### For Developers

1. **Never Store Secrets in Code**
   - Use environment variables
   - Never commit `.env` or `.env.local` files
   - Rotate secrets regularly

2. **Always Validate Input**
   - Use validation schemas for all endpoints
   - Never trust user input
   - Validate on both client and server

3. **Use Parameterized Queries**
   - Always use Supabase query builder
   - Never construct SQL strings manually
   - Use `SafeQueryBuilder` for complex queries

4. **Sanitize Output**
   - All responses are automatically sanitized
   - Use `sanitizeResponse()` for manual sanitization
   - Never expose sensitive data

5. **Keep Dependencies Updated**
   - Run `npm audit` regularly
   - Update dependencies with security patches
   - Review dependency security advisories

### For Administrators

1. **Use Strong Secrets**
   - JWT secrets: 32+ characters, random
   - Generate: `openssl rand -hex 32`
   - Never reuse secrets across environments

2. **Enable HTTPS**
   - Required for production
   - Enforced by `Strict-Transport-Security` header
   - Use valid SSL/TLS certificates

3. **Monitor Security Logs**
   - Review `auth_audit_log` daily
   - Check `security_events` for critical issues
   - Set up alerts for brute force attempts

4. **Configure CORS**
   - Set `FRONTEND_URL` to your actual domain
   - Never use `*` in production
   - Whitelist only trusted origins

5. **Regular Security Audits**
   - Review access logs
   - Check for unusual patterns
   - Validate security configurations

### For Users

1. **Use Strong Passwords**
   - Minimum 8 characters
   - Mix of letters, numbers, symbols
   - Avoid common passwords

2. **Protect Your Credentials**
   - Never share your password
   - Log out after use
   - Use different passwords for different accounts

3. **Report Suspicious Activity**
   - Failed login attempts
   - Unusual emails or notifications
   - Contact administrator immediately

---

## 🚨 Vulnerability Disclosure

### Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

**Email:** security@your-domain.com (replace with actual email)

**Include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Please DO NOT:**
- Publicly disclose the vulnerability
- Exploit the vulnerability
- Test on production systems

### Response Timeline

- **24 hours:** Initial acknowledgment
- **72 hours:** Vulnerability assessment
- **7 days:** Fix development and testing
- **14 days:** Patch deployment and disclosure

### Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities.

---

## 📝 Security Checklist

### Deployment Security

- [ ] All required environment variables configured
- [ ] JWT secrets are strong and unique
- [ ] HTTPS is enabled
- [ ] CORS is configured for production domain
- [ ] Cookie domain is set correctly
- [ ] NODE_ENV is set to 'production'
- [ ] Database migrations applied
- [ ] Passwords migrated to bcrypt
- [ ] Rate limiting is active
- [ ] Security headers are applied
- [ ] Audit logging is enabled
- [ ] Error messages don't leak sensitive info

### Ongoing Security

- [ ] Monitor auth_audit_log daily
- [ ] Review security_events weekly
- [ ] Update dependencies monthly
- [ ] Rotate JWT secrets quarterly
- [ ] Security audit annually
- [ ] Backup database regularly
- [ ] Test disaster recovery plan

---

## 📚 Additional Resources

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **JWT Best Practices:** https://tools.ietf.org/html/rfc8725
- **CORS Guide:** https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- **CSP Guide:** https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

---

**Last Updated:** 2024-01-15  
**Security Version:** 2.0.0  
**Compliance:** OWASP Top 10, GDPR-ready, HIPAA-ready
