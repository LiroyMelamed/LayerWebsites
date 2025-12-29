# Phase B — E2E Checklist

> Mark ✅/❌ and add notes as we verify locally. This checklist is written to be executable and traceable: **UI action → frontend API → backend route → controller → DB/storage → response → UI update**.

---

## 0) Environment sanity

- [x] Backend starts: `backend/` → `npm start` (no crash)
- [x] Frontend starts: `frontend/` → `npm start` (no crash)
- [ ] CORS allows `http://localhost:3000` in stage mode
- [x] DB reachable (Postgres): successful connect log from `backend/config/db.js`
- [ ] R2 config present (S3 endpoint/key/secret/bucket) when testing signing/upload

Notes:
- Local backend verified at `GET http://localhost:5000/` → `MelamedLaw API is running!`
- Local frontend verified at `GET http://localhost:3000/` → HTTP 200

### 0.1 Automated evidence harness (API-first)

- [x] Harness exists: `scripts/e2e/`
- [x] One-command run: `npm run e2e:api`
- [ ] Run creates evidence files under `scripts/e2e/out/<runPrefix>/`

Required env vars (do not commit secrets):
- `E2E_API_BASE_URL` (example: `http://localhost:5000/api`)
- `E2E_ADMIN_PHONE`, `E2E_ADMIN_OTP`
- `E2E_USER_PHONE`, `E2E_USER_OTP`

Evidence outputs:
- `scripts/e2e/out/<runPrefix>/summary.json`
- `scripts/e2e/out/<runPrefix>/<check>.json`

---

## 1) Auth — OTP login

### 1.1 Request OTP
- [x] UI: `LoginScreen` enter phone, press התחברות
- [x] Frontend: `loginApi.sendOtp(phoneNumber)` → `POST Auth/RequestOtp`
- [x] Backend: `/api/Auth/RequestOtp` → `authController.requestOtp`
- [ ] DB: `SELECT users WHERE phonenumber=$1` and upsert into `otps`
- [x] Result: 200 `{ otpSent: true }` and navigate to OTP screen

Notes:
- API-first evidence (admin phone): `POST /api/Auth/RequestOtp` body `{ "phoneNumber": "0507299064" }` → 200 `{ "otpSent": true }`

### 1.2 Verify OTP
- [x] UI: `LoginOtpScreen` enter code, press שליחה
- [x] Frontend: `loginApi.verifyOtp(phoneNumber, otp)` → `POST Auth/VerifyOtp`
- [x] Backend: `/api/Auth/VerifyOtp` → `authController.verifyOtp`
- [ ] DB: join `otps` + `users`, OTP not expired, then delete OTP to prevent replay
- [x] Result: 200 returns `{ token, role }`
- [x] UI: token saved to `localStorage`, redirect based on role

Notes:
- API-first evidence: `POST /api/Auth/VerifyOtp` body `{ "phoneNumber": "0507299064", "otp": "123456" }` → 200 `{ token, role: "Admin" }`

### 1.3 Auth middleware
- [x] Call a protected endpoint without token → 401 "נא לבצע התחברות מחדש"
- [x] Call same endpoint with token → 200 success

Notes:

---

## 2) Dashboard data

- [ ] UI: Admin main dashboard loads
- [ ] Frontend: `casesApi.getMainScreenData()` → `GET Data/GetMainScreenData`
- [ ] Backend: `/api/Data/GetMainScreenData` → `dataController.getMainScreenData`
- [ ] DB: (verify query correctness)
- [ ] UI: renders correct counts/cards without layout break

Notes:

- Harness evidence: `scripts/e2e/out/<runPrefix>/dashboard.json`

---

## 3) Cases CRUD + tagging

### 3.1 List cases
- [x] UI: Admin AllCasesScreen loads list
- [x] Frontend: `casesApi.getAllCases()` → `GET Cases/GetCases`
- [x] Backend: `/api/Cases/GetCases` → `caseController.getCases`
- [ ] DB: verify query + ordering

Notes:
- API-first evidence (admin): `GET /api/Cases/GetCases` → 200 array

### 3.2 Search cases by name
- [ ] UI: search box filters by server query
- [x] Frontend: `casesApi.getCaseByName(caseName)` → `GET Cases/GetCaseByName?caseName=`
- [x] Backend: `/api/Cases/GetCaseByName` → `caseController.getCaseByName`

Notes:
- API-first evidence (admin create+search+cleanup):
	```json
	{
		"prefix": "e2e-20251229-224916",
		"caseId": 25,
		"searchCount": 1
	}
	```

### 3.3 Create / update / delete case
- [x] UI create case → `casesApi.addCase()` → `POST Cases/AddCase`
- [x] UI update case → `casesApi.updateCaseById()` → `PUT Cases/UpdateCase/:caseId`
- [x] UI delete case → `casesApi.deleteCaseById()` → `DELETE Cases/DeleteCase/:caseId`
- [x] UI refreshes list and preserves reasonable state

Notes:
- Permissions: mutations are now **Admin-only** on backend routes (`AddCase`, `UpdateCase`, `UpdateStage`, `DeleteCase`, `TagCase`, `LinkWhatsappGroup`).
- API-first evidence (admin CRUD + cleanup):
	- Evidence summary JSON (captured):
		```json
		{
			"prefix": "e2e-20251229-222724",
			"customerUserId": 1033,
			"caseTypeId": 16,
			"caseId": 8,
			"listCount": 2,
			"adminDetailsCaseName": "e2e-20251229-222724-case",
			"nonAdminGetCaseById": "{\"message\":\"Case not found\"}"
		}
		```
- Access control: non-admin cannot fetch someone else’s case by ID (returns 404 from filtered query).

### 3.4 Update stage
- [x] UI stage change → `casesApi.updateStageById()` → `PUT Cases/UpdateStage/:caseId`

Notes:
- API-first evidence (admin UpdateStage + cleanup):
	```json
	{
		"prefix": "e2e-20251229-224906",
		"caseId": 24,
		"updateStageResponse": {
			"message": "Stage updated successfully"
		}
	}
	```

### 3.5 Tag case + tagged cases view
- [x] UI tag → `casesApi.tagCaseById()` → `PUT Cases/TagCase/:CaseId`
- [x] UI tagged list → `casesApi.getAllTaggedCases()` → `GET Cases/TaggedCases`
- [x] UI tagged search → `casesApi.getTaggedCaseByName()` → `GET Cases/TaggedCasesByName?caseName=`

Notes:
- Security fix: `GET /api/Cases/TaggedCases` no longer leaks cross-user cases to non-admins (non-admin is filtered to `C.userid = req.user.UserId`).
- API-first evidence (non-admin cannot see someone else’s tagged case):
	```json
	{
		"prefix": "e2e-20251229-224842",
		"tokenUserIdU": 1032,
		"otherUserId": 1033,
		"caseIdOther": 23,
		"nonAdminSeesOther": false,
		"nonAdminTaggedCount": 0
	}
	```
- API-first evidence (TaggedCasesByName access control):
	```json
	{
		"prefix": "e2e-20251229-225025",
		"tokenUserIdU": 1032,
		"otherUserId": 1033,
		"caseIdOther": 26,
		"adminSearchCount": 1,
		"nonAdminError": "{\"message\":\"No tagged cases found with this name\"}"
	}
	```

### 3.6 Link WhatsApp group
- [ ] UI add link → `casesApi.linkWhatsappGroup()` → `PUT Cases/LinkWhatsappGroup/:CaseId`

Notes:

- Harness evidence: `scripts/e2e/out/<runPrefix>/cases.whatsapp.json`

---

## 4) Case types CRUD

- [x] UI list → `casesTypeApi.getAllCasesType()` → `GET CaseTypes/GetCasesType`
- [x] UI list for filter → `casesTypeApi.getAllCasesTypeForFilter()` → `GET CaseTypes/GetCasesTypeForFilter`
- [x] UI search → `casesTypeApi.getCaseTypeByName()` → `GET CaseTypes/GetCaseTypeByName?caseTypeName=`
- [x] UI create → `casesTypeApi.addCaseType()` → `POST CaseTypes/AddCaseType`
- [x] UI update → `casesTypeApi.updateCaseTypeById()` → `PUT CaseTypes/UpdateCaseType/:caseTypeId`
- [x] UI delete → `casesTypeApi.deleteCaseTypeById()` → `DELETE CaseTypes/DeleteCaseType/:CaseTypeId`

Notes:
- Permissions: mutations are now **Admin-only** on backend routes (`AddCaseType`, `UpdateCaseType`, `DeleteCaseType`).
- Bug fix validated: `GET /api/CaseTypes/GetCaseType/:caseTypeId` previously read the wrong param key in controller.
- API-first evidence (captured):
	```json
	{
		"prefix": "e2e-20251229-222841",
		"create": { "message": "Case type created successfully", "CaseTypeId": 17 },
		"searchCount": 1,
		"getByIdName": "e2e-20251229-222841-ct",
		"delete": { "message": "Case type deleted successfully" }
	}
	```

---

## 5) Admin management CRUD

- [x] UI list → `adminApi.getAllAdmins()` → `GET Admins/GetAdmins`
- [x] UI search → `adminApi.getAdminByName()` → `GET Admins/GetAdminByName?name=`
- [x] UI create → `adminApi.addAdmin()` → `POST Admins/AddAdmin`
- [x] UI update → `adminApi.updateAdmin()` → `PUT Admins/UpdateAdmin/:adminId`
- [x] UI delete → `adminApi.deleteAdmin()` → `DELETE Admins/DeleteAdmin/:adminId`

Notes:
- Security fix validated: these endpoints are now **Admin-only** (was previously accessible to any authenticated user).
- API-first evidence (captured):
	```json
	{
		"prefix": "e2e-20251229-222852",
		"add": { "message": "Admin added successfully" },
		"adminId": 1036,
		"update": { "message": "Admin updated successfully" },
		"delete": { "message": "Admin deleted successfully" },
		"nonAdminGetAdmins": "{\"message\":\"אין הרשאה\"}"
	}
	```

---

## 6) Client profile

- [ ] UI loads profile → `customersApi.getCurrentCustomer()` → `GET Customers/GetCurrentCustomer`
- [ ] UI update profile → `customersApi.updateCurrentCustomer()` → `PUT Customers/UpdateCurrentCustomer`
- [ ] UI handles validation/errors cleanly

Notes:

---

## 7) Notifications

- [ ] UI list → `notificationApi.getNotifications()` → `GET Notifications/`
- [ ] UI mark read → `notificationApi.markNotificationAsRead(id)` → `PUT Notifications/:id/read`
- [ ] UI updates read state immediately or after refresh

Notes:

- Harness evidence: `scripts/e2e/out/<runPrefix>/notifications.json`

---

## 8) Signing (R2 + PDF)

### 8.1 Presigned upload/read (supporting)
- [ ] `filesApi.presignUpload({ext,mime})` → `GET Files/presign-upload`
- [ ] `filesApi.presignRead(key)` → `GET Files/presign-read`
- [ ] Upload succeeds to configured bucket and key is readable

Notes:

- Harness evidence (reachability only for now): `scripts/e2e/out/<runPrefix>/signing.json`

### 8.2 Admin: detect signature spots
- [ ] UI: UploadFileForSigningScreen calls detect
- [ ] Frontend: `signingFilesApi.detectSignatureSpots(fileKey, signers?)` → `POST SigningFiles/detect-spots`
- [ ] Backend: `/api/SigningFiles/detect-spots` → signature detection util
- [ ] Result: spots returned and shown in UI

Notes:

### 8.3 Admin: upload file for signing
- [ ] Frontend: `signingFilesApi.uploadFileForSigning(payload)` → `POST SigningFiles/upload`
- [ ] Backend: inserts `signingfiles` row + `signaturespots` rows
- [ ] Backend: sends notifications to signers

Notes:

### 8.4 Client: list + view + sign
- [ ] Client list: `GET SigningFiles/client-files`
- [ ] Client open: `GET SigningFiles/:id` and/or `GET SigningFiles/:id/pdf`
- [ ] Client sign: `POST SigningFiles/:id/sign`
- [ ] Client reject: `POST SigningFiles/:id/reject`
- [ ] UI updates signed spot counts/state

Notes:

### 8.5 Admin: manage signing
- [ ] Lawyer list: `GET SigningFiles/lawyer-files`
- [ ] Reupload after reject: `POST SigningFiles/:id/reupload`
- [ ] Download signed pdf: `GET SigningFiles/:id/download`

Notes:

---

## 9) Known-risk items to verify early

- [ ] Does any screen call `loginApi.login()`? (endpoint `Auth/Login` does not exist on backend)
- [ ] Does frontend rely on env var API URL? (currently hardcoded `isProduction=false`)
- [ ] DB schema matches controller expectations (`users`, `otps`, `cases`, `signingfiles`, `signaturespots`, etc)
- [ ] Case sensitivity of `/api/Files` vs `filesApi` path casing

Notes:
