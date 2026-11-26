# Estate Visitor Access Management — API Documentation
**Base URL:** `http://localhost:5000`
**Auth Header (Protected Routes):** `Authorization: Bearer <JWT_TOKEN>`

---

## 0. System & Health Check

| Method | Endpoint | Access | Request Body (JSON) |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | None (Checks if Express server is running) |



## 1. Authentication (`/api/auth`)

| Method | Endpoint | Access | Request Body (JSON) |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | `{ "fullName", "phoneNumber", "password", "houseNumber?", "role?", "adminCode?" }` |
| `POST` | `/api/auth/login` | Public | `{ "phoneNumber", "password" }` |
| `POST` | `/api/auth/otp/send` | Public | `{ "phoneNumber" }` |
| `POST` | `/api/auth/otp/verify` | Public | `{ "phoneNumber", "otpCode" }` |
| `POST` | `/api/auth/reset-password` | Public | `{ "phoneNumber", "otpCode", "newPassword" }` |
| `PATCH` | `/api/auth/change-password` | Logged-in | `{ "currentPassword", "newPassword" }` |

## 2. Resident (`/api/resident`) — *Role: `RESIDENT`*

| Method | Endpoint | Request Body / Query |
| :--- | :--- | :--- |
| `GET` | `/api/resident/dashboard` | None |
| `GET` | `/api/resident/rules` | None |
| `POST` | `/api/resident/passes` | `{ "visitorName", "visitorPhone", "purpose", "visitDateTime", "validFrom?", "validTo?" }` |
| `GET` | `/api/resident/passes` | Optional query: `?status=ACTIVE` |
| `PATCH` | `/api/resident/passes/:id/window` | `{ "validFrom", "validTo" }` |
| `PATCH` | `/api/resident/passes/:id/cancel` | None |
| `PATCH` | `/api/resident/passes/:id/decision` | `{ "decision": "APPROVE" \| "REJECT" }` |
| `GET` | `/api/resident/blocked-visitors` | None |
| `POST` | `/api/resident/blocked-visitors` | `{ "fullName", "phoneNumber", "reason?" }` |
| `DELETE` | `/api/resident/blocked-visitors/:id` | None |

## 3. Security Guard (`/api/guard`) — *Role: `GUARD` or `ADMIN`*

| Method | Endpoint | Request Body / Query |
| :--- | :--- | :--- |
| `POST` | `/api/guard/verify-pass` | `{ "qrToken" }` OR `{ "passCode" }` |
| `POST` | `/api/guard/confirm-entry` | `{ "passId", "gateName?" }` |
| `POST` | `/api/guard/checkout/:passId` | `{ "gateName?" }` |
| `GET` | `/api/guard/visitors-inside` | None |
| `POST` | `/api/guard/walk-ins` | `{ "visitorName", "visitorPhone", "purpose", "houseNumber" }` |

## 4. Estate Admin (`/api/admin`) — *Role: `ADMIN`*

| Method | Endpoint | Request Body / Query |
| :--- | :--- | :--- |
| `GET` | `/api/admin/dashboard` | None |
| `GET` | `/api/admin/users` | Optional query: `?role=RESIDENT` or `?role=GUARD` |
| `POST` | `/api/admin/guards` | `{ "fullName", "phoneNumber", "password" }` |
| `PATCH` | `/api/admin/users/:userId/house` | `{ "houseNumber" }` |
| `DELETE` | `/api/admin/users/:userId` | None |
| `PATCH` | `/api/admin/passes/:id/cancel` | None |
| `GET` | `/api/admin/visit-history` | Optional queries: `?from=&to=&house=&phone=&name=&action=` |
| `GET` | `/api/admin/visit-history/export` | Downloads `.csv` report |
| `GET` | `/api/admin/blocked-visitors` | None |
| `POST` | `/api/admin/blocked-visitors` | `{ "fullName", "phoneNumber", "reason?" }` |
| `DELETE` | `/api/admin/blocked-visitors/:id` | None |
| `GET` | `/api/admin/settings` | None |
| `PUT` | `/api/admin/settings` | `{ "estateName?", "passExpiryHours?", "requireResidentApprovalAtGate?", "estateRules?" }` |

