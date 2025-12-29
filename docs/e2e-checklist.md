# Phase B — E2E Checklist

> Mark ✅/❌ and add notes as we verify locally. This checklist is written to be executable and traceable: **UI action → frontend API → backend route → controller → DB/storage → response → UI update**.

---

## 0) Environment sanity

- [ ] Backend starts: `backend/` → `npm start` (no crash)
- [ ] Frontend starts: `frontend/` → `npm start` (no crash)
- [ ] CORS allows `http://localhost:3000` in stage mode
- [ ] DB reachable (Postgres): successful connect log from `backend/config/db.js`
- [ ] R2 config present (S3 endpoint/key/secret/bucket) when testing signing/upload

Notes:

---

## 1) Auth — OTP login

### 1.1 Request OTP
- [ ] UI: `LoginScreen` enter phone, press התחברות
- [ ] Frontend: `loginApi.sendOtp(phoneNumber)` → `POST Auth/RequestOtp`
- [ ] Backend: `/api/Auth/RequestOtp` → `authController.requestOtp`
- [ ] DB: `SELECT users WHERE phonenumber=$1` and upsert into `otps`
- [ ] Result: 200 `{ otpSent: true }` and navigate to OTP screen

Notes:

### 1.2 Verify OTP
- [ ] UI: `LoginOtpScreen` enter code, press שליחה
- [ ] Frontend: `loginApi.verifyOtp(phoneNumber, otp)` → `POST Auth/VerifyOtp`
- [ ] Backend: `/api/Auth/VerifyOtp` → `authController.verifyOtp`
- [ ] DB: join `otps` + `users`, OTP not expired, then delete OTP to prevent replay
- [ ] Result: 200 returns `{ token, role }`
- [ ] UI: token saved to `localStorage`, redirect based on role

Notes:

### 1.3 Auth middleware
- [ ] Call a protected endpoint without token → 401 "נא לבצע התחברות מחדש"
- [ ] Call same endpoint with token → 200 success

Notes:

---

## 2) Dashboard data

- [ ] UI: Admin main dashboard loads
- [ ] Frontend: `casesApi.getMainScreenData()` → `GET Data/GetMainScreenData`
- [ ] Backend: `/api/Data/GetMainScreenData` → `dataController.getMainScreenData`
- [ ] DB: (verify query correctness)
- [ ] UI: renders correct counts/cards without layout break

Notes:

---

## 3) Cases CRUD + tagging

### 3.1 List cases
- [ ] UI: Admin AllCasesScreen loads list
- [ ] Frontend: `casesApi.getAllCases()` → `GET Cases/GetCases`
- [ ] Backend: `/api/Cases/GetCases` → `caseController.getCases`
- [ ] DB: verify query + ordering

Notes:

### 3.2 Search cases by name
- [ ] UI: search box filters by server query
- [ ] Frontend: `casesApi.getCaseByName(caseName)` → `GET Cases/GetCaseByName?caseName=`
- [ ] Backend: `/api/Cases/GetCaseByName` → `caseController.getCaseByName`

Notes:

### 3.3 Create / update / delete case
- [ ] UI create case → `casesApi.addCase()` → `POST Cases/AddCase`
- [ ] UI update case → `casesApi.updateCaseById()` → `PUT Cases/UpdateCase/:caseId`
- [ ] UI delete case → `casesApi.deleteCaseById()` → `DELETE Cases/DeleteCase/:caseId`
- [ ] UI refreshes list and preserves reasonable state

Notes:

### 3.4 Update stage
- [ ] UI stage change → `casesApi.updateStageById()` → `PUT Cases/UpdateStage/:caseId`

Notes:

### 3.5 Tag case + tagged cases view
- [ ] UI tag → `casesApi.tagCaseById()` → `PUT Cases/TagCase/:CaseId`
- [ ] UI tagged list → `casesApi.getAllTaggedCases()` → `GET Cases/TaggedCases`
- [ ] UI tagged search → `casesApi.getTaggedCaseByName()` → `GET Cases/TaggedCasesByName?caseName=`

Notes:

### 3.6 Link WhatsApp group
- [ ] UI add link → `casesApi.linkWhatsappGroup()` → `PUT Cases/LinkWhatsappGroup/:CaseId`

Notes:

---

## 4) Case types CRUD

- [ ] UI list → `casesTypeApi.getAllCasesType()` → `GET CaseTypes/GetCasesType`
- [ ] UI list for filter → `casesTypeApi.getAllCasesTypeForFilter()` → `GET CaseTypes/GetCasesTypeForFilter`
- [ ] UI search → `casesTypeApi.getCaseTypeByName()` → `GET CaseTypes/GetCaseTypeByName?caseTypeName=`
- [ ] UI create → `casesTypeApi.addCaseType()` → `POST CaseTypes/AddCaseType`
- [ ] UI update → `casesTypeApi.updateCaseTypeById()` → `PUT CaseTypes/UpdateCaseType/:caseTypeId`
- [ ] UI delete → `casesTypeApi.deleteCaseTypeById()` → `DELETE CaseTypes/DeleteCaseType/:CaseTypeId`

Notes:

---

## 5) Admin management CRUD

- [ ] UI list → `adminApi.getAllAdmins()` → `GET Admins/GetAdmins`
- [ ] UI search → `adminApi.getAdminByName()` → `GET Admins/GetAdminByName?name=`
- [ ] UI create → `adminApi.addAdmin()` → `POST Admins/AddAdmin`
- [ ] UI update → `adminApi.updateAdmin()` → `PUT Admins/UpdateAdmin/:adminId`
- [ ] UI delete → `adminApi.deleteAdmin()` → `DELETE Admins/DeleteAdmin/:adminId`

Notes:

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

---

## 8) Signing (R2 + PDF)

### 8.1 Presigned upload/read (supporting)
- [ ] `filesApi.presignUpload({ext,mime})` → `GET Files/presign-upload`
- [ ] `filesApi.presignRead(key)` → `GET Files/presign-read`
- [ ] Upload succeeds to configured bucket and key is readable

Notes:

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
