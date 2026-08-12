# InclusyQ Backend Architecture

## 🏗️ Enterprise MVC Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VERCEL SERVERLESS FUNCTIONS                  │
│  (4 entry points — file-based routing, thin inline routers)     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  api/index.ts     api/tokens.ts    api/admin.ts    api/upload.ts│
│  (General)        (Token Ops)      (Admin CRUD)    (File Upload)│
│                                                                   │
└────────┬──────────────────┬───────────────┬──────────────┬──────┘
         │                  │               │              │
         ▼                  ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          MIDDLEWARE                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ corsMiddle   │  │ authMiddle   │  │ errorHandler │          │
│  │ ware.ts      │  │ ware.ts      │  │ .ts          │          │
│  │              │  │              │  │              │          │
│  │ • CORS       │  │ • requireAuth│  │ • wrapAsync  │          │
│  │ • Preflight  │  │ • requireAdmin│ │ • Error catch│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CONTROLLERS                              │
│         (HTTP request/response handling only)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ authController      dataController     queueController    │   │
│  │ patientController   deviceController   trackController    │   │
│  │ tokenController     adminController    uploadController   │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                          SERVICES                                │
│              (Business logic orchestration)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ authService    emailService    tokenService              │   │
│  │ adminService   queueService                              │   │
│  │                                                           │   │
│  │ • Orchestrate repositories                               │   │
│  │ • Implement business rules                               │   │
│  │ • Coordinate cross-cutting operations                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       REPOSITORIES                               │
│              (Raw database access only)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ tokenRepository    userRepository                         │   │
│  │ settingsRepository deviceRepository                       │   │
│  │                                                           │   │
│  │ • Pure CRUD operations                                    │   │
│  │ • No business logic                                       │   │
│  │ • Return raw database rows                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ api/config/    │
                    │ supabase.ts    │
                    └────────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │   SUPABASE   │
                      │   DATABASE   │
                      └──────────────┘
```

---

## 📊 Request Flow Example

### Example: `POST /api/tokens` (Create Token)

```
1. CLIENT REQUEST
   POST /api/tokens
   Body: { patientName, patientMobile, departmentId, doctorId, ... }
   Header: x-operator-username: reception

2. ENTRY POINT (api/tokens.ts)
   ├─ Apply CORS (corsMiddleware)
   ├─ Check authentication (requireAuth)
   └─ Route to controller → createTokenHandler(req, res)

3. CONTROLLER (tokenController.ts)
   ├─ Extract request data
   ├─ Call service layer
   │   const result = await createToken(req.body)
   └─ Return HTTP response
       res.status(200).json(result)

4. SERVICE (tokenService.ts)
   ├─ Validate operator authorization (authService)
   ├─ Generate token number
   ├─ Check department authorization
   ├─ Insert token (tokenRepository)
   ├─ Ensure patient exists (userRepository)
   ├─ Add queue log (queueService)
   ├─ Recalculate wait times (queueService)
   └─ Send email notification (emailService)
       return { success: true, token }

5. REPOSITORIES (tokenRepository, userRepository)
   ├─ insertToken() → supabase.from('tokens').insert()
   ├─ findPatientByMobile() → supabase.from('patients').select()
   └─ insertPatient() → supabase.from('patients').insert()

6. DATABASE (Supabase PostgreSQL)
   ├─ INSERT INTO tokens (...)
   ├─ SELECT FROM patients WHERE mobile = ?
   ├─ INSERT INTO patients (...)
   └─ INSERT INTO queue_logs (...)

7. RESPONSE TO CLIENT
   {
     "success": true,
     "token": {
       "id": "tok-1234567890",
       "tokenNumber": "GEN-001",
       "status": "waiting",
       ...
     }
   }
```

---

## 🔐 Authentication Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /api/login
       │ { username, password, portal }
       ▼
┌──────────────────┐
│   Entry Point    │
│  (api/index.ts)  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ authController   │
│  .loginHandler() │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  authService     │
│ .authenticateUser│
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ userRepository   │
│.findUserByUsername│
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   Supabase DB    │
│ SELECT FROM users│
└──────┬───────────┘
       │
       ▼
┌─────────────┐
│ Response    │
│ { user }    │
└─────────────┘

Subsequent requests include:
Header: x-operator-username: <username>
```

---

## 🎯 Layer Responsibilities

### Entry Points (4 files)
**Responsibility:** Route incoming HTTP requests to controllers
- Apply CORS middleware
- Handle preflight OPTIONS requests
- Perform inline regex path matching (Vercel requirement)
- Delegate to appropriate controller

**Rules:**
- ❌ NO business logic
- ❌ NO database queries
- ❌ NO service calls
- ✅ Pure routing only

---

### Middleware (3 files)
**Responsibility:** Cross-cutting concerns
- **corsMiddleware**: CORS headers + preflight handling
- **authMiddleware**: Extract/validate operator credentials
- **errorHandler**: Catch and format exceptions

**Rules:**
- ✅ Reusable across all routes
- ✅ Composable
- ❌ NO business logic

---

### Controllers (9 files)
**Responsibility:** HTTP request/response handling
- Parse request parameters (body, query, headers, path params)
- Call appropriate service methods
- Format HTTP responses (status codes, JSON bodies)
- Handle HTTP-specific errors (400, 401, 403, 404, 500)

**Rules:**
- ❌ NO business logic
- ❌ NO database queries
- ✅ Call services only
- ✅ Return HTTP responses

---

### Services (5 files)
**Responsibility:** Business logic orchestration
- Implement business rules
- Orchestrate multiple repository calls
- Coordinate cross-cutting operations (email, logging)
- Handle domain-specific errors

**Rules:**
- ❌ NO HTTP handling (no req/res objects)
- ❌ NO raw database queries
- ✅ Call repositories
- ✅ Return domain objects or results

---

### Repositories (4 files)
**Responsibility:** Raw database access
- Pure CRUD operations
- Build and execute Supabase queries
- Return raw database rows (no mapping)

**Rules:**
- ❌ NO business logic
- ❌ NO service calls
- ✅ Supabase queries only
- ✅ Return raw data

---

### Utils (3 files)
**Responsibility:** Shared utilities
- **mappers.ts**: DB row → TypeScript type conversion
- **response.ts**: HTTP response helpers
- **seed.ts**: Default credentials seeding

---

## 🔄 Data Flow

```
Request → Middleware → Controller → Service → Repository → Database
                                                                │
                                                                ▼
Response ← Controller ← Service ← Repository ← Database Result
```

---

## 🚀 Benefits of This Architecture

### ✅ Testability
- Each layer can be tested in isolation
- Mock repositories for service tests
- Mock services for controller tests

### ✅ Maintainability
- Clear separation of concerns
- Single Responsibility Principle
- Easy to locate and fix bugs

### ✅ Scalability
- Add new features without touching existing code
- Reuse services across multiple controllers
- Reuse repositories across multiple services

### ✅ Flexibility
- Swap database layer (Supabase → PostgreSQL)
- Change auth strategy without touching controllers
- Add new delivery mechanisms (GraphQL, gRPC)

---

## 📚 Code Examples

### ❌ BEFORE (Monolithic)
```typescript
// api/index.ts (OLD)
if (path === '/api/tokens' && method === 'POST') {
  // 150+ lines of inline business logic
  const { patientName, departmentId } = req.body
  const { data: dept } = await supabase.from('departments').select()
  const tokenNumber = `${dept.prefix}-${count}`
  await supabase.from('tokens').insert(...)
  await supabase.from('queue_logs').insert(...)
  await recalculateQueue()
  await sendEmail(...)
  return res.json({ token })
}
```

### ✅ AFTER (Layered)
```typescript
// api/tokens.ts (NEW)
if (path === '/api/tokens' && method === 'POST') {
  return wrapAsync(createTokenHandler)(req, res)
}

// controllers/tokenController.ts
export async function createTokenHandler(req, res) {
  const result = await createToken(req.body)
  return res.status(200).json(result)
}

// services/tokenService.ts
export async function createToken(data) {
  const dept = await findDepartmentById(data.departmentId)
  const tokenNumber = generateTokenNumber(dept)
  const token = await insertToken({ ...data, tokenNumber })
  await addQueueLog(token.id, 'created')
  await recalculateQueueWaitTimes()
  await sendTokenEmail(token)
  return { success: true, token }
}

// repositories/tokenRepository.ts
export async function insertToken(data) {
  const { data: rows } = await supabase.from('tokens').insert(data).select()
  return rows[0]
}
```

---

## 🎓 Summary

This architecture follows **SOLID principles**:
- **S**ingle Responsibility: Each layer has one job
- **O**pen/Closed: Easy to extend, hard to break
- **L**iskov Substitution: Layers are interchangeable
- **I**nterface Segregation: Small, focused interfaces
- **D**ependency Inversion: High-level depends on abstractions

The result is a **maintainable**, **testable**, and **scalable** backend that preserves all existing functionality while enabling future growth.
