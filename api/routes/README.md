# API Routes Documentation

This folder documents the routing structure. Actual routing is implemented inline in each Vercel serverless function entry point due to Vercel's file-based routing requirements.

## Route → Controller Mapping

### `api/index.ts` (Main API)
| Method | Path | Controller | Auth |
|--------|------|------------|------|
| POST | `/api/login` | `authController.loginHandler` | None |
| GET | `/api/data` | `dataController.getDataHandler` | None |
| GET | `/api/queue` | `queueController.getQueueHandler` | None |
| POST | `/api/queue/pause` | `queueController.togglePauseHandler` | Auth |
| POST | `/api/announcements` | `queueController.addAnnouncementHandler` | Auth |
| DELETE | `/api/announcements/:id` | `queueController.deleteAnnouncementHandler` | Auth |
| POST | `/api/patients` | `patientController.createPatientHandler` | Auth |
| GET | `/api/devices` | `deviceController.listDevicesHandler` | Auth |
| POST | `/api/devices` | `deviceController.createDeviceHandler` | Admin |
| POST | `/api/devices/assign` | `deviceController.assignDeviceHandler` | Auth |
| POST | `/api/devices/unassign` | `deviceController.unassignDeviceHandler` | Auth |

### `api/tokens.ts` (Token Operations)
| Method | Path | Controller | Auth |
|--------|------|------------|------|
| POST | `/api/tokens` | `tokenController.createTokenHandler` | Auth |
| POST | `/api/tokens/:id/call` | `tokenController.callTokenHandler` | Auth |
| POST | `/api/tokens/:id/complete` | `tokenController.completeTokenHandler` | Auth |
| POST | `/api/tokens/:id/skip` | `tokenController.skipTokenHandler` | Auth |
| POST | `/api/tokens/:id/cancel` | `tokenController.cancelTokenHandler` | Auth |
| POST | `/api/tokens/:id/recall` | `tokenController.recallTokenHandler` | Auth |
| GET | `/api/track/:tokenId` | `trackController.trackTokenHandler` | None |

### `api/admin.ts` (Admin CRUD)
| Method | Path | Controller | Auth |
|--------|------|------------|------|
| POST | `/api/admin/doctors` | `adminController.createDoctorHandler` | Admin |
| PUT | `/api/admin/doctors/:id` | `adminController.updateDoctorHandler` | Admin |
| DELETE | `/api/admin/doctors/:id` | `adminController.deleteDoctorHandler` | Admin |
| POST | `/api/admin/doctors/:id/toggle` | `adminController.toggleDoctorStatusHandler` | Admin |
| POST | `/api/admin/departments` | `adminController.createDepartmentHandler` | Admin |
| PUT | `/api/admin/departments/:id` | `adminController.updateDepartmentHandler` | Admin |
| DELETE | `/api/admin/departments/:id` | `adminController.deleteDepartmentHandler` | Admin |
| POST | `/api/admin/rooms` | `adminController.createRoomHandler` | Admin |
| PUT | `/api/admin/rooms/:id` | `adminController.updateRoomHandler` | Admin |
| DELETE | `/api/admin/rooms/:id` | `adminController.deleteRoomHandler` | Admin |
| POST | `/api/admin/staff` | `adminController.createStaffHandler` | Admin |
| PUT | `/api/admin/staff/:id` | `adminController.updateStaffHandler` | Admin |
| DELETE | `/api/admin/staff/:id` | `adminController.deleteStaffHandler` | Admin |
| PUT | `/api/admin/settings/queue` | `adminController.updateQueueConfigHandler` | Admin |
| PUT | `/api/admin/settings/hospital` | `adminController.updateHospitalInfoHandler` | Admin |

### `api/upload.ts` (File Upload)
| Method | Path | Controller | Auth |
|--------|------|------------|------|
| POST | `/api/upload/logo` | `uploadController.uploadLogoHandler` | Admin |

## Architecture Notes

- **Inline Routing**: Each entry point (`index.ts`, `tokens.ts`, `admin.ts`, `upload.ts`) uses inline regex matching because Vercel's file-based routing requires `export default handler` per file.
- **Middleware**: CORS applied in all entry points, auth checked before protected routes.
- **Controllers**: Pure HTTP handlers, delegate to services.
- **Services**: Business logic orchestration, call repositories.
- **Repositories**: Raw database queries only.
