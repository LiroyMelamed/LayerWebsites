# Phase A — System Audit Plan (LayerWebsites)

## 0) What this repo is

**Frontend**
- Framework/build: React 18 + `react-scripts` (Create React App)
- Routing: `react-router-dom` v6 (stacks)
- HTTP: Axios wrapper in `frontend/src/api/apiUtils.js`
- i18n: `i18next` + `react-i18next`
- PDF: `react-pdf` + `pdfjs-dist`

**Styling approach (current state)**
- Global base styles: `frontend/src/index.css`
- Global theme vars: `frontend/src/styles/theme.scss` (CSS variables)
- Screen/component styles: mostly per-component `.scss` imported directly (e.g. `./TopCenteredLogoOtp.scss`)
- Many layout styles are still inline styles in components (e.g. Login/OTP screens)

**Backend**
- Framework: Node.js + Express
- Auth: JWT bearer token via `Authorization: Bearer <token>`
- DB access: `pg` Pool in `backend/config/db.js` (PostgreSQL)
- Storage: S3-compatible (Cloudflare R2) via AWS SDK (`backend/utils/r2.js`)

**Important mismatch to track**
- README mentions “Azure SQL”, but `backend/config/db.js` is PostgreSQL (`pg`). Treat DB as PostgreSQL for local + staging until proven otherwise.
- Frontend has `Auth/Login` in `frontend/src/api/loginApi.js`, but backend routes only expose `Auth/RequestOtp`, `Auth/VerifyOtp`, `Auth/Register`. If `loginApi.login()` is used anywhere, it will fail.
- Frontend API base URL is hardcoded in `frontend/src/api/apiUtils.js` via an `isProduction` boolean, not via `REACT_APP_*` env vars as README suggests.

---

## 1) How to run locally (target)

### Backend
- Location: `backend/`
- Expected env (based on code):
  - `PORT` (default 5000)
  - `JWT_SECRET`
  - Postgres: `DB_USER`, `DB_PASSWORD`, `DB_NAME`, optional `DB_HOST`, `DB_PORT`, `DB_SSL`
  - R2/S3: `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_BUCKET`
- Start: `npm install` then `npm start`
- Health: `GET http://localhost:5000/` → "MelamedLaw API is running!"

### Frontend
- Location: `frontend/`
- Start: `npm install` then `npm start`
- Note: API base URL currently hardcoded to `http://localhost:5000/api` (stageURL).

---

## 2) Main pages / screens (frontend)

### Router stacks
- Login stack: `frontend/src/navigation/LoginStack.js`
  - `/LoginStack/LoginScreen`
  - `/LoginStack/LoginOtpScreen`
- Admin stack: `frontend/src/navigation/AdminStack.js`
  - `/AdminStack/MainScreen`
  - `/AdminStack/TaggedCasesScreen`
  - `/AdminStack/AllCasesScreen`
  - `/AdminStack/AllMangerScreen`
  - `/AdminStack/AllCasesTypeScreen`
  - `/AdminStack/SigningManagerScreen`
  - `/AdminStack/UploadFileForSigningScreen`
- Client stack: `frontend/src/navigation/ClientStack.js`
  - `/ClientStack/ClientMainScreen`
  - `/ClientStack/NotificationsScreen`
  - `/ClientStack/SigningScreen`
  - `/ClientStack/ProfileScreen`

### Key components participating in major flows
- Login: `frontend/src/screens/loginScreen/LoginScreen.js`
- OTP verify: `frontend/src/screens/otpScreen/OtpScreen.js/LoginOtpScreen.js`
- Admin dashboard: `frontend/src/screens/mainScreen/MainScreen.js`
- Cases list + tagging: `frontend/src/screens/allCasesScreen/AllCasesScreen.js`, `frontend/src/screens/taggedCasesScreen/TaggedCasesScreen.js`
- Admin management: `frontend/src/screens/allMangerScreen/AllMangerScreen.js`
- Case types: `frontend/src/screens/allCasesTypeScreen/AllCasesTypeScreen.js`
- Signing: `frontend/src/screens/signingScreen/*` + `frontend/src/components/specializedComponents/signFiles/*`
- Client notifications/profile: `frontend/src/screens/client/notifications/NotificationsScreen.js`, `frontend/src/screens/client/profile/ProfileScreen.js`

---

## 3) Backend API surface (actual routes)

Base server mounts (from `backend/server.js`):
- `/api/Auth` → `backend/routes/auth.js`
- `/api/Customers` → `backend/routes/customerRoutes.js`
- `/api/Cases` → `backend/routes/caseRoutes.js`
- `/api/Admins` → `backend/routes/adminRoutes.js`
- `/api/CaseTypes` → `backend/routes/caseTypeRoutes.js`
- `/api/Data` → `backend/routes/dataRoutes.js`
- `/api/Notifications` → `backend/routes/notificationRoutes.js`
- `/api/Files` → `backend/routes/filesRoutes.js`
- `/api/SigningFiles` → `backend/routes/signingFileRoutes.js`

### Auth (`/api/Auth`)
- `POST /RequestOtp` (no auth)
- `POST /VerifyOtp` (no auth)
- `POST /Register` (no auth)

### Customers (`/api/Customers`) — requires JWT
- `GET /GetCustomers`
- `POST /AddCustomer`
- `PUT /UpdateCustomer/:customerId`
- `GET /GetCustomerByName`
- `GET /GetCurrentCustomer`
- `PUT /UpdateCurrentCustomer`
- `DELETE /DeleteCustomer/:userId`
- `DELETE /DeleteMyAccount`

### Cases (`/api/Cases`) — requires JWT
- `GET /GetCases`
- `GET /GetCase/:caseId`
- `GET /GetCaseByName`
- `POST /AddCase`
- `PUT /UpdateCase/:caseId`
- `PUT /UpdateStage/:caseId`
- `DELETE /DeleteCase/:caseId`
- `PUT /TagCase/:CaseId`
- `GET /TaggedCases`
- `GET /TaggedCasesByName`
- `PUT /LinkWhatsappGroup/:CaseId`

### Admins (`/api/Admins`) — requires JWT
- `GET /GetAdmins`
- `GET /GetAdminByName`
- `POST /AddAdmin`
- `PUT /UpdateAdmin/:adminId`
- `DELETE /DeleteAdmin/:adminId`

### CaseTypes (`/api/CaseTypes`) — requires JWT
- `GET /GetCasesType`
- `GET /GetCasesTypeForFilter`
- `GET /GetCaseType/:caseTypeId`
- `GET /GetCaseTypeByName`
- `POST /AddCaseType`
- `PUT /UpdateCaseType/:caseTypeId`
- `DELETE /DeleteCaseType/:CaseTypeId`

### Data (`/api/Data`) — requires JWT
- `GET /GetMainScreenData`

### Notifications (`/api/Notifications`) — requires JWT
- `POST /SaveDeviceToken`
- `GET /` (list notifications)
- `PUT /:id/read`

### Files (`/api/Files`) — requires JWT
- `GET /presign-upload`
- `GET /presign-read`

### SigningFiles (`/api/SigningFiles`) — requires JWT
- `POST /detect-spots`
- `POST /upload`
- `GET /client-files`
- `GET /lawyer-files`
- `GET /pending`
- `GET /:signingFileId/pdf`
- `GET /:signingFileId`
- `POST /:signingFileId/sign`
- `POST /:signingFileId/reject`
- `POST /:signingFileId/reupload`
- `GET /:signingFileId/download`

---

## 4) Frontend → API usage map (high confidence)

### Login flow
- `LoginScreen` → `loginApi.sendOtp()` → `POST Auth/RequestOtp`
- `LoginOtpScreen` → `loginApi.verifyOtp()` → `POST Auth/VerifyOtp`
- Token stored in `localStorage` and attached by Axios interceptor.

### Admin dashboards and CRUD
- `MainScreen` → `casesApi.getMainScreenData()` → `GET Data/GetMainScreenData`
- `AllCasesScreen` → `casesApi.getAllCases()` / `casesApi.getCaseByName()` / `casesApi.updateCaseById()` / `casesApi.deleteCaseById()`
- `TaggedCasesScreen` → `casesApi.getAllTaggedCases()` / `casesApi.getTaggedCaseByName()` / `casesApi.updateCaseById()`
- `AllCasesTypeScreen` → `casesTypeApi.getAllCasesType()` / `casesTypeApi.getCaseTypeByName()` / `casesTypeApi.addCaseType()` / `casesTypeApi.updateCaseTypeById()` / `casesTypeApi.deleteCaseTypeById()`
- `AllMangerScreen` → `adminApi.getAllAdmins()` / `adminApi.getAdminByName()` / `adminApi.addAdmin()` / `adminApi.updateAdmin()` / `adminApi.deleteAdmin()`

### Client
- `ClientMainScreen` → `casesApi.getAllCases()` and `casesTypeApi.getAllCasesTypeForFilter()`
- `NotificationsScreen` → `notificationApi.getNotifications()` / `notificationApi.markNotificationAsRead()`
- `ProfileScreen` → `customersApi.getCurrentCustomer()` / `customersApi.updateCurrentCustomer()`

### Signing
- Admin: `UploadFileForSigningScreen` → `signingFilesApi.detectSignatureSpots()` and `signingFilesApi.uploadFileForSigning()`
- Admin: `SigningManagerScreen` → `signingFilesApi.getLawyerSigningFiles()` / `downloadSignedFile()`
- Client: `SigningScreen` → `signingFilesApi.getClientSigningFiles()` / `downloadSignedFile()`
- Signing interaction: `SignatureCanvas` → `getSigningFileDetails()` / `signFile()` / `rejectSigning()`

### File presigning
- `fileUploadUtils` → `filesApi.presignUpload()` / `filesApi.presignRead()`

---

## 5) Critical flows to validate in Phase B

1. OTP login (request + verify) and correct role-based routing
2. Auth guard coverage: all protected endpoints reject missing/expired token
3. Main dashboard loads (`GetMainScreenData`)
4. Cases: list/search/create/update/delete + tag + WhatsApp link
5. Case types: list/search/create/update/delete
6. Admin management: list/search/create/update/delete
7. Client profile: load + update current customer
8. Notifications: list + mark as read
9. Signing:
   - Admin: upload file for signing (R2 upload + signature spot detection)
   - Client: see pending doc + view PDF + sign + reject
   - Admin: reupload after rejection + see status changes
   - Download signed PDF
10. Upload/presign endpoints: upload/read keys work with R2 bucket

---

## 6) Phase B success criteria (E2E)

E2E is considered **PASS** when:
- Frontend boots without console errors and can complete login.
- All critical flows above succeed on a clean local environment.
- API returns consistent JSON error shapes and proper status codes.
- UI handles loading/empty/error states without breaking layout.

---

## 7) Phase C–F strategy (high-level)

**C (CSS→SCSS + rem)**
- Keep global `theme.scss` as the source of CSS variables.
- Introduce `frontend/src/styles/_variables.scss`, `_mixins.scss`, `_globals.scss` (and import from `theme.scss` or `index.js`).
- Convert remaining `.css` into `.scss` where present, and remove repeated inline layout styles.
- Convert px→rem with 16px baseline, keep hairline borders in px when needed.

**D (Class names)**
- Add meaningful BEM-ish classes to layout elements currently relying on inline style objects.

**E (RTL)**
- Ensure `dir="rtl"` at app root and convert left/right to logical props where practical.

**F (UI polish)**
- Normalize spacing and typography using a small rem-based scale.
