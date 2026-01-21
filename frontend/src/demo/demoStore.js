// frontend/src/demo/demoStore.js
// In-memory demo database for iframe demo mode.
// Hard rule: only active when isDemoModeEnabled() is true.

import { isDemoModeEnabled } from "../utils/demoMode";

function nowIso() {
    return new Date().toISOString();
}

function makeMinimalPdfBlob(titleText) {
    // Tiny valid-ish PDF (good enough for preview/download in modern browsers)
    const text = String(titleText || "מסמך הדגמה").slice(0, 80);
    const content = `%PDF-1.3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 66 >>\nstream\nBT\n/F1 18 Tf\n72 720 Td\n(${text}) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000114 00000 n \n0000000249 00000 n \n0000000371 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n444\n%%EOF\n`;
    return new Blob([content], { type: "application/pdf" });
}

function makeZipLikeBlob(label) {
    // Not a real zip, but good enough for demo download flows.
    // If later needed, swap to JSZip.
    const content = `DEMO ZIP\n${label || "evidence"}\ncreatedAt=${nowIso()}\n`;
    return new Blob([content], { type: "application/zip" });
}

function createDb() {
    return {
        version: 1,
        seeded: false,
        listeners: new Set(),

        seq: {
            customer: 9000,
            case: 100,
            caseType: 500,
            admin: 8000,
            upload: 1,
            evidence: 1,
            notification: 1,
        },

        customersById: new Map(),
        casesById: new Map(),
        caseTypesById: new Map(),
        adminsById: new Map(),

        uploadsByKey: new Map(),
        signingFilesById: new Map(),
        evidencePackagesBySigningFileId: new Map(),

        notificationsById: new Map(),

        customerIds: [],
        caseIds: [],
        signingFileIds: [],

        notificationIds: [],
    };
}

let db = null;

export function getDemoVersion() {
    return db?.version || 0;
}

export function demoSubscribe(listener) {
    if (!isDemoModeEnabled()) return () => { };
    const s = getDemoState();
    s.listeners.add(listener);
    return () => {
        s.listeners.delete(listener);
    };
}

function notify(event) {
    if (!db) return;
    db.version += 1;
    for (const fn of db.listeners) {
        try {
            fn(event);
        } catch {
            // ignore
        }
    }
}

function nextId(kind) {
    db.seq[kind] = (db.seq[kind] || 0) + 1;
    return db.seq[kind];
}

function upsertCustomer(raw) {
    const id = Number(raw?.UserId ?? raw?.userid);
    const normalized = {
        UserId: id,
        Name: raw?.Name ?? raw?.name ?? "",
        PhoneNumber: raw?.PhoneNumber ?? raw?.phonenumber ?? "",
        Email: raw?.Email ?? raw?.email ?? "",
        CompanyName: raw?.CompanyName ?? raw?.companyname ?? "",

        userid: id,
        name: raw?.Name ?? raw?.name ?? "",
        phonenumber: raw?.PhoneNumber ?? raw?.phonenumber ?? "",
        email: raw?.Email ?? raw?.email ?? "",
        companyname: raw?.CompanyName ?? raw?.companyname ?? "",

        CreatedAt: raw?.CreatedAt ?? nowIso(),
        UpdatedAt: raw?.UpdatedAt ?? nowIso(),
    };

    db.customersById.set(id, normalized);
    if (!db.customerIds.includes(id)) db.customerIds.unshift(id);

    return normalized;
}

function upsertCase(raw) {
    const id = Number(raw?.CaseId);
    const normalized = {
        CaseId: id,
        CaseName: raw?.CaseName ?? "",
        CaseTypeName: raw?.CaseTypeName ?? "",
        CompanyName: raw?.CompanyName ?? "",
        CurrentStage: Number(raw?.CurrentStage ?? 1),
        CustomerMail: raw?.CustomerMail ?? "",
        CustomerName: raw?.CustomerName ?? "",
        Descriptions: Array.isArray(raw?.Descriptions) ? raw.Descriptions : [],
        IsClosed: Boolean(raw?.IsClosed),
        IsTagged: Boolean(raw?.IsTagged),
        PhoneNumber: raw?.PhoneNumber ?? "",
        UserId: raw?.UserId ?? null,
        CaseManager: raw?.CaseManager ?? "",
        CaseManagerId: raw?.CaseManagerId ?? "",
        CostumerTaz: raw?.CostumerTaz ?? "",
        EstimatedCompletionDate: raw?.EstimatedCompletionDate ?? null,
        LicenseExpiryDate: raw?.LicenseExpiryDate ?? null,
        CreatedAt: raw?.CreatedAt ?? nowIso(),
        UpdatedAt: raw?.UpdatedAt ?? nowIso(),
        LastActivityAt: raw?.LastActivityAt ?? raw?.UpdatedAt ?? nowIso(),
    };

    db.casesById.set(id, normalized);
    if (!db.caseIds.includes(id)) db.caseIds.unshift(id);
    return normalized;
}

function normalizeCaseTypeDescriptions(descriptions) {
    if (!Array.isArray(descriptions)) return [];
    return descriptions
        .filter(Boolean)
        .map((d, idx) => ({
            Stage: Number(d?.Stage ?? idx + 1),
            Text: String(d?.Text ?? "").trim(),
            Timestamp: d?.Timestamp ?? "",
            IsNew: Boolean(d?.IsNew),
            New: Boolean(d?.New),
        }))
        .sort((a, b) => (a.Stage || 0) - (b.Stage || 0));
}

function ensureCaseTypeFromCase({ CaseTypeName, Descriptions }) {
    const s = getDemoState();
    if (!s) return null;

    const name = String(CaseTypeName || "").trim();
    if (!name) return null;

    const normalizedDescriptions = normalizeCaseTypeDescriptions(Descriptions);
    const numberOfStages = Math.max(
        1,
        normalizedDescriptions.length,
        ...normalizedDescriptions.map((d) => Number(d?.Stage || 0))
    );

    const existing = Array.from(s.caseTypesById.values()).find((ct) => String(ct?.CaseTypeName || "") === name) || null;
    if (!existing) {
        const created = {
            CaseTypeId: nextId("caseType"),
            CaseTypeName: name,
            NumberOfStages: numberOfStages,
            Descriptions: normalizedDescriptions.length
                ? normalizedDescriptions
                : Array.from({ length: numberOfStages }).map((_, idx) => ({
                    Stage: idx + 1,
                    Text: idx === 0 ? "פתיחה" : idx === numberOfStages - 1 ? "סגירה" : `שלב ${idx + 1}`,
                    Timestamp: "",
                    IsNew: false,
                    New: false,
                })),
        };
        s.caseTypesById.set(created.CaseTypeId, created);
        notify({ type: "caseTypes/create", id: created.CaseTypeId });
        return created;
    }

    const shouldUpdateStages = normalizedDescriptions.length > 0;
    const updated = {
        ...existing,
        CaseTypeName: name,
        NumberOfStages: numberOfStages,
        ...(shouldUpdateStages ? { Descriptions: normalizedDescriptions } : null),
    };
    s.caseTypesById.set(existing.CaseTypeId, updated);
    notify({ type: "caseTypes/update", id: existing.CaseTypeId });
    return updated;
}

// Required helpers (used by API modules)
export function demoOk(data) {
    return Promise.resolve({ ok: true, status: 200, data });
}

export function demoNotFound(message = "Not found") {
    return Promise.resolve({ ok: false, status: 404, message, data: { message } });
}

export function seedDemoData() {
    if (!db || db.seeded) return;

    // Strict minimal seed (per spec)
    const admin1 = { userid: nextId("admin"), name: 'עו"ד הדגמה' };
    const admin2 = { userid: nextId("admin"), name: "מזכירה הדגמה" };
    db.adminsById.set(admin1.userid, admin1);
    db.adminsById.set(admin2.userid, admin2);

    const ctRealEstateId = nextId("caseType");
    db.caseTypesById.set(ctRealEstateId, {
        CaseTypeId: ctRealEstateId,
        CaseTypeName: 'נדל"ן',
        NumberOfStages: 5,
        Descriptions: [
            { Stage: 1, Text: "פתיחת תיק", Timestamp: "", IsNew: false, New: false },
            { Stage: 2, Text: "איסוף מסמכים", Timestamp: "", IsNew: false, New: false },
            { Stage: 3, Text: "טיוטת הסכם", Timestamp: "", IsNew: false, New: false },
            { Stage: 4, Text: "חתימות", Timestamp: "", IsNew: false, New: false },
            { Stage: 5, Text: "סגירה", Timestamp: "", IsNew: false, New: false },
        ],
    });

    const ctPowerOfAttorneyId = nextId("caseType");
    db.caseTypesById.set(ctPowerOfAttorneyId, {
        CaseTypeId: ctPowerOfAttorneyId,
        CaseTypeName: "ייפוי כוח",
        NumberOfStages: 4,
        Descriptions: [
            { Stage: 1, Text: "פתיחת תיק", Timestamp: "", IsNew: false, New: false },
            { Stage: 2, Text: "אימות פרטים", Timestamp: "", IsNew: false, New: false },
            { Stage: 3, Text: "חתימה", Timestamp: "", IsNew: false, New: false },
            { Stage: 4, Text: "סגירה", Timestamp: "", IsNew: false, New: false },
        ],
    });

    const now = Date.now();
    const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

    const clientId = nextId("customer");
    const client = upsertCustomer({
        UserId: clientId,
        Name: "דנה לוי",
        PhoneNumber: "0521234567",
        Email: "dana.levy@example.com",
        CompanyName: "לוי נדל\"ן",
        CreatedAt: daysAgo(420),
        UpdatedAt: daysAgo(2),
    });

    const other1 = upsertCustomer({
        UserId: nextId("customer"),
        Name: "יוסי כהן",
        PhoneNumber: "0545551111",
        Email: "yossi.cohen@example.com",
        CompanyName: "כהן ושות׳",
        CreatedAt: daysAgo(600),
        UpdatedAt: daysAgo(40),
    });

    const other2 = upsertCustomer({
        UserId: nextId("customer"),
        Name: "מיכל פרץ",
        PhoneNumber: "0507772222",
        Email: "michal.peretz@example.com",
        CompanyName: "פרץ אחזקות",
        CreatedAt: daysAgo(800),
        UpdatedAt: daysAgo(90),
    });

    const other3 = upsertCustomer({
        UserId: nextId("customer"),
        Name: "רועי מזרחי",
        PhoneNumber: "0538883333",
        Email: "roee.mizrahi@example.com",
        CompanyName: "מזרחי תעשיות",
        CreatedAt: daysAgo(300),
        UpdatedAt: daysAgo(10),
    });

    db.customerIds = [client.UserId, other1.UserId, other2.UserId, other3.UserId];

    const case1Id = nextId("case");
    upsertCase({
        CaseId: case1Id,
        CaseName: "רכישת דירה - רמת גן",
        CaseTypeName: 'נדל"ן',
        CompanyName: client.CompanyName,
        CurrentStage: 3,
        CustomerMail: client.Email,
        CustomerName: client.Name,
        PhoneNumber: client.PhoneNumber,
        UserId: client.UserId,
        CaseManager: admin1.name,
        CaseManagerId: admin1.userid,
        CostumerTaz: "123456789",
        IsClosed: false,
        IsTagged: true,
        EstimatedCompletionDate: daysAgo(-30),
        LicenseExpiryDate: daysAgo(365),
        Descriptions: [
            { Stage: 1, Text: "פתיחת תיק", Timestamp: daysAgo(25), IsNew: false, New: false },
            { Stage: 2, Text: "איסוף מסמכים", Timestamp: daysAgo(18), IsNew: false, New: false },
            { Stage: 3, Text: "טיוטת הסכם", Timestamp: "", IsNew: true, New: true },
            { Stage: 4, Text: "חתימות", Timestamp: "", IsNew: false, New: false },
            { Stage: 5, Text: "סגירה", Timestamp: "", IsNew: false, New: false },
        ],
        CreatedAt: daysAgo(25),
        UpdatedAt: daysAgo(1),
        LastActivityAt: daysAgo(1),
    });

    const case2Id = nextId("case");
    upsertCase({
        CaseId: case2Id,
        CaseName: "ייפוי כוח מתמשך",
        CaseTypeName: "ייפוי כוח",
        CompanyName: client.CompanyName,
        CurrentStage: 2,
        CustomerMail: client.Email,
        CustomerName: client.Name,
        PhoneNumber: client.PhoneNumber,
        UserId: client.UserId,
        CaseManager: admin2.name,
        CaseManagerId: admin2.userid,
        CostumerTaz: "123456789",
        IsClosed: false,
        IsTagged: false,
        EstimatedCompletionDate: daysAgo(-14),
        LicenseExpiryDate: daysAgo(365),
        Descriptions: [
            { Stage: 1, Text: "פתיחת תיק", Timestamp: daysAgo(12), IsNew: false, New: false },
            { Stage: 2, Text: "אימות פרטים", Timestamp: "", IsNew: true, New: true },
            { Stage: 3, Text: "חתימה", Timestamp: "", IsNew: false, New: false },
            { Stage: 4, Text: "סגירה", Timestamp: "", IsNew: false, New: false },
        ],
        CreatedAt: daysAgo(12),
        UpdatedAt: daysAgo(3),
        LastActivityAt: daysAgo(3),
    });

    const case3Id = nextId("case");
    upsertCase({
        CaseId: case3Id,
        CaseName: "סגירת תיק ישן (הסתיים)",
        CaseTypeName: 'נדל"ן',
        CompanyName: client.CompanyName,
        CurrentStage: 5,
        CustomerMail: client.Email,
        CustomerName: client.Name,
        PhoneNumber: client.PhoneNumber,
        UserId: client.UserId,
        CaseManager: admin1.name,
        CaseManagerId: admin1.userid,
        CostumerTaz: "123456789",
        IsClosed: true,
        IsTagged: true,
        EstimatedCompletionDate: daysAgo(0),
        LicenseExpiryDate: daysAgo(365),
        Descriptions: [
            { Stage: 1, Text: "פתיחת תיק", Timestamp: daysAgo(120), IsNew: false, New: false },
            { Stage: 2, Text: "איסוף מסמכים", Timestamp: daysAgo(110), IsNew: false, New: false },
            { Stage: 3, Text: "טיוטת הסכם", Timestamp: daysAgo(95), IsNew: false, New: false },
            { Stage: 4, Text: "חתימות", Timestamp: daysAgo(90), IsNew: false, New: false },
            { Stage: 5, Text: "סגירה", Timestamp: daysAgo(80), IsNew: false, New: false },
        ],
        CreatedAt: daysAgo(120),
        UpdatedAt: daysAgo(80),
        LastActivityAt: daysAgo(80),
    });

    const pendingUploadKey = `demo://upload/${nextId("upload")}`;
    const pendingPdfBlob = makeMinimalPdfBlob("מסמך לחתימה - הדגמה");
    db.uploadsByKey.set(pendingUploadKey, {
        key: pendingUploadKey,
        fileName: "מסמך לחתימה - הדגמה.pdf",
        ext: "pdf",
        mime: "application/pdf",
        size: pendingPdfBlob.size,
        blob: pendingPdfBlob,
        uploadedAt: daysAgo(3),
        objectUrl: null,
    });

    db.signingFilesById.set("sf_demo_1", {
        SigningFileId: "sf_demo_1",
        FileName: "מסמך לחתימה - הדגמה.pdf",
        FileKey: pendingUploadKey,
        CaseId: case2Id,
        CaseName: "ייפוי כוח מתמשך",
        ClientName: client.Name,
        Status: "pending",
        CreatedAt: daysAgo(3),
        SignedAt: null,
        RequireOtp: true,
        OtpEnabled: true,
        TotalSpots: 2,
        SignedSpots: 0,
        RejectionReason: null,
        signatureSpots: [],
    });

    const signedUploadKey = `demo://upload/${nextId("upload")}`;
    const signedPdfBlob = makeMinimalPdfBlob("מסמך דוגמא – חתום");
    db.uploadsByKey.set(signedUploadKey, {
        key: signedUploadKey,
        fileName: "מסמך דוגמא – חתום.pdf",
        ext: "pdf",
        mime: "application/pdf",
        size: signedPdfBlob.size,
        blob: signedPdfBlob,
        uploadedAt: daysAgo(7),
        objectUrl: null,
    });

    db.signingFilesById.set("sf_demo_2", {
        SigningFileId: "sf_demo_2",
        FileName: "מסמך דוגמא – חתום.pdf",
        FileKey: signedUploadKey,
        CaseId: case1Id,
        CaseName: "רכישת דירה - רמת גן",
        ClientName: client.Name,
        Status: "signed",
        CreatedAt: daysAgo(7),
        SignedAt: daysAgo(2),
        RequireOtp: true,
        OtpEnabled: true,
        TotalSpots: 2,
        SignedSpots: 2,
        RejectionReason: null,
        signatureSpots: [],
    });

    db.signingFileIds = ["sf_demo_1", "sf_demo_2"];

    db.evidencePackagesBySigningFileId.set("sf_demo_2", {
        evidenceId: `ev_${nextId("evidence")}`,
        signingFileId: "sf_demo_2",
        caseId: case1Id,
        clientDisplayName: client.Name,
        caseDisplayName: "רכישת דירה - רמת גן",
        documentDisplayName: "מסמך דוגמא – חתום.pdf",
        signedAtUtc: daysAgo(2),
        otpPolicy: { requireOtp: true, waivedBy: "" },
        evidenceZipBlob: makeZipLikeBlob("evidence: sf_demo_2\nfiles: pdf/json/txt"),
        evidencePdfBlob: makeMinimalPdfBlob("תעודת ראיות - הדגמה"),
        createdAt: daysAgo(2),
    });

    // Seed one welcome notification without calling demoCreateNotification (prevents recursion)
    const nid = nextId("notification");
    db.notificationsById.set(nid, {
        notificationid: nid,
        createdat: nowIso(),
        isread: false,
        title: "ברוכים הבאים להדגמה",
        message: "זהו מצב הדגמה. אין קריאות רשת לשרת.",
    });
    db.notificationIds.unshift(nid);

    db.seeded = true;
    notify({ type: "seed" });
}

// --- Notifications (demo only) ---
export function demoCreateNotification({ title, message }) {
    const s = getDemoState();
    if (!s) return null;
    const id = nextId("notification");
    const created = {
        notificationid: id,
        createdat: nowIso(),
        isread: false,
        title: String(title || "התראה").trim(),
        message: String(message || "").trim(),
    };
    s.notificationsById.set(id, created);
    s.notificationIds.unshift(id);
    notify({ type: "notifications/create", id });
    return created;
}

export function demoListNotifications() {
    const s = getDemoState();
    if (!s) return [];
    return s.notificationIds.map((id) => s.notificationsById.get(id)).filter(Boolean);
}

export function demoMarkNotificationAsRead(notificationId) {
    const s = getDemoState();
    if (!s) return null;
    const id = Number(notificationId);
    const current = s.notificationsById.get(id);
    if (!current) return null;
    const updated = { ...current, isread: true };
    s.notificationsById.set(id, updated);
    notify({ type: "notifications/read", id });
    return updated;
}

export function getDemoState() {
    if (!isDemoModeEnabled()) return null;
    if (!db) db = createDb();
    if (!db.seeded) seedDemoData();
    return db;
}

export function resetDemoState() {
    if (!isDemoModeEnabled()) return null;
    db = createDb();
    seedDemoData();
    return db;
}

// --- Customers CRUD ---

export function demoListCustomers() {
    const s = getDemoState();
    if (!s) return [];
    return s.customerIds.map((id) => s.customersById.get(id)).filter(Boolean);
}

export function demoSearchCustomersByName(userName) {
    const s = getDemoState();
    if (!s) return [];
    const q = String(userName || "").trim().toLowerCase();
    if (!q) return demoListCustomers();
    return demoListCustomers().filter((c) => String(c?.Name || c?.name || "").toLowerCase().includes(q));
}

export function demoCreateCustomer({ name, phoneNumber, email, companyName }) {
    const s = getDemoState();
    if (!s) return null;
    const created = upsertCustomer({
        UserId: nextId("customer"),
        Name: String(name || "").trim(),
        PhoneNumber: String(phoneNumber || "").trim(),
        Email: String(email || "").trim(),
        CompanyName: String(companyName || "").trim(),
        CreatedAt: nowIso(),
        UpdatedAt: nowIso(),
    });
    notify({ type: "customers/create", id: created.UserId });
    return created;
}

export function demoUpdateCustomer(userId, { name, phoneNumber, email, companyName }) {
    const s = getDemoState();
    if (!s) return null;
    const id = Number(userId);
    const current = s.customersById.get(id);
    if (!current) return null;

    const updated = upsertCustomer({
        ...current,
        UserId: id,
        Name: name != null ? String(name).trim() : current.Name,
        PhoneNumber: phoneNumber != null ? String(phoneNumber).trim() : current.PhoneNumber,
        Email: email != null ? String(email).trim() : current.Email,
        CompanyName: companyName != null ? String(companyName).trim() : current.CompanyName,
        UpdatedAt: nowIso(),
    });

    notify({ type: "customers/update", id });
    return updated;
}

export function demoDeleteCustomer(userId) {
    const s = getDemoState();
    if (!s) return false;
    const id = Number(userId);
    if (!s.customersById.has(id)) return false;

    for (const caseId of Array.from(s.caseIds)) {
        const cs = s.casesById.get(caseId);
        if (cs?.UserId === id) {
            s.casesById.delete(caseId);
            s.caseIds = s.caseIds.filter((x) => x !== caseId);
        }
    }

    s.customersById.delete(id);
    s.customerIds = s.customerIds.filter((x) => x !== id);

    notify({ type: "customers/delete", id });
    return true;
}

// --- Cases CRUD ---

export function demoListCases() {
    const s = getDemoState();
    if (!s) return [];
    return s.caseIds.map((id) => s.casesById.get(id)).filter(Boolean);
}

export function demoSearchCasesByName(caseName) {
    const q = String(caseName || "").toLowerCase();
    if (!q) return demoListCases();
    return demoListCases().filter((c) => String(c?.CaseName || "").toLowerCase().includes(q));
}

export function demoGetCaseById(caseId) {
    const s = getDemoState();
    if (!s) return null;
    return s.casesById.get(Number(caseId)) || null;
}

export function demoCreateCase(caseData) {
    const s = getDemoState();
    if (!s) return null;

    const id = nextId("case");
    const customerId = Number(caseData?.UserId || caseData?.userId || 0) || null;
    const customer = customerId ? s.customersById.get(customerId) : null;

    const caseTypeName = String(caseData?.CaseTypeName || "").trim();
    const caseType =
        Array.from(s.caseTypesById.values()).find((ct) => ct.CaseTypeName === caseTypeName) || null;
    const stageCount = Number(caseType?.NumberOfStages || 3);

    const descriptions =
        Array.isArray(caseData?.Descriptions) && caseData.Descriptions.length
            ? caseData.Descriptions
            : Array.from({ length: stageCount }).map((_, idx) => ({
                Stage: idx + 1,
                Text: idx === 0 ? "פתיחה" : idx === stageCount - 1 ? "סגירה" : `שלב ${idx + 1}`,
                Timestamp: "",
                IsNew: idx === 0,
                New: idx === 0,
            }));

    const created = upsertCase({
        ...caseData,
        CaseId: id,
        CaseName: String(caseData?.CaseName || `${id}`).trim(),
        CustomerName: String(caseData?.CustomerName || customer?.Name || "").trim(),
        CustomerMail: String(caseData?.CustomerMail || customer?.Email || "").trim(),
        PhoneNumber: String(caseData?.PhoneNumber || customer?.PhoneNumber || "").trim(),
        CompanyName: String(caseData?.CompanyName || customer?.CompanyName || "").trim(),
        UserId: customerId || null,
        CurrentStage: Number(caseData?.CurrentStage || 1),
        Descriptions: descriptions,
        IsClosed: Boolean(caseData?.IsClosed),
        IsTagged: Boolean(caseData?.IsTagged),
        CreatedAt: nowIso(),
        UpdatedAt: nowIso(),
        LastActivityAt: nowIso(),
    });

    ensureCaseTypeFromCase({
        CaseTypeName: created?.CaseTypeName,
        Descriptions: created?.Descriptions,
    });

    notify({ type: "cases/create", id });
    return created;
}

export function demoUpdateCase(caseId, caseData) {
    const s = getDemoState();
    if (!s) return null;
    const id = Number(caseId);
    const current = s.casesById.get(id);
    if (!current) return null;

    const updated = upsertCase({
        ...current,
        ...caseData,
        CaseId: id,
        UpdatedAt: nowIso(),
        LastActivityAt: nowIso(),
    });

    ensureCaseTypeFromCase({
        CaseTypeName: updated?.CaseTypeName,
        Descriptions: updated?.Descriptions,
    });

    notify({ type: "cases/update", id });
    return updated;
}

export function demoDeleteCase(caseId) {
    const s = getDemoState();
    if (!s) return false;
    const id = Number(caseId);
    if (!s.casesById.has(id)) return false;
    s.casesById.delete(id);
    s.caseIds = s.caseIds.filter((x) => x !== id);
    notify({ type: "cases/delete", id });
    return true;
}

// --- Case Types ---

export function demoListCaseTypes() {
    const s = getDemoState();
    if (!s) return [];
    return Array.from(s.caseTypesById.values());
}

export function demoSearchCaseTypesByName(name) {
    const s = getDemoState();
    if (!s) return [];
    const q = String(name || "").toLowerCase();
    if (!q) return demoListCaseTypes();
    return demoListCaseTypes().filter((ct) => String(ct.CaseTypeName || "").toLowerCase().includes(q));
}

export function demoAddCaseType(caseTypeData) {
    const s = getDemoState();
    if (!s) return null;

    const CaseTypeId = nextId("caseType");
    const CaseTypeName = String(caseTypeData?.CaseTypeName || "").trim();
    const NumberOfStages = Number(caseTypeData?.NumberOfStages || 3);

    const Descriptions = Array.isArray(caseTypeData?.Descriptions) && caseTypeData.Descriptions.length
        ? caseTypeData.Descriptions
        : Array.from({ length: NumberOfStages }).map((_, idx) => ({
            Stage: idx + 1,
            Text: idx === 0 ? "פתיחה" : idx === NumberOfStages - 1 ? "סגירה" : `שלב ${idx + 1}`,
            Timestamp: "",
            IsNew: idx === 0,
            New: idx === 0,
        }));

    const created = {
        CaseTypeId,
        CaseTypeName,
        NumberOfStages,
        Descriptions,
    };

    s.caseTypesById.set(CaseTypeId, created);
    notify({ type: "caseTypes/create", id: CaseTypeId });
    return created;
}

export function demoUpdateCaseType(caseTypeId, caseTypeData) {
    const s = getDemoState();
    if (!s) return null;
    const id = Number(caseTypeId);
    const current = s.caseTypesById.get(id);
    if (!current) return null;

    const updated = {
        ...current,
        ...caseTypeData,
        CaseTypeId: id,
        CaseTypeName:
            caseTypeData?.CaseTypeName != null ? String(caseTypeData.CaseTypeName).trim() : current.CaseTypeName,
        NumberOfStages:
            caseTypeData?.NumberOfStages != null ? Number(caseTypeData.NumberOfStages) : current.NumberOfStages,
    };

    s.caseTypesById.set(id, updated);
    notify({ type: "caseTypes/update", id });
    return updated;
}

export function demoDeleteCaseType(caseTypeId) {
    const s = getDemoState();
    if (!s) return false;
    const id = Number(caseTypeId);
    const ok = s.caseTypesById.delete(id);
    if (ok) notify({ type: "caseTypes/delete", id });
    return ok;
}

// --- Uploads ---

export function demoStoreUpload({ key, fileName, ext, mime, size, blob }) {
    const s = getDemoState();
    if (!s) return null;
    const k = key ? String(key) : `demo://upload/${nextId("upload")}`;
    s.uploadsByKey.set(k, {
        key: k,
        fileName,
        ext,
        mime,
        size,
        blob,
        uploadedAt: nowIso(),
        objectUrl: null,
    });
    notify({ type: "uploads/create", key: k });
    return s.uploadsByKey.get(k);
}

export function demoGetUpload(key) {
    const s = getDemoState();
    if (!s) return null;
    return s.uploadsByKey.get(String(key)) || null;
}

export function demoGetOrCreateUploadObjectUrl(key) {
    const s = getDemoState();
    if (!s) return null;
    const item = s.uploadsByKey.get(String(key));
    if (!item?.blob) return null;
    if (!item.objectUrl) item.objectUrl = URL.createObjectURL(item.blob);
    return item.objectUrl;
}

export function demoDeleteUpload(key) {
    const s = getDemoState();
    if (!s) return false;
    const k = String(key);
    const item = s.uploadsByKey.get(k);
    if (!item) return false;
    if (item.objectUrl) {
        try {
            URL.revokeObjectURL(item.objectUrl);
        } catch {
            // ignore
        }
    }
    s.uploadsByKey.delete(k);
    notify({ type: "uploads/delete", key: k });
    return true;
}

// --- Signing files / evidence ---

export function demoListSigningFiles() {
    const s = getDemoState();
    if (!s) return [];
    const ids = Array.from(s.signingFilesById.keys());
    return ids
        .map((id) => s.signingFilesById.get(id))
        .filter(Boolean)
        .sort((a, b) => String(b?.CreatedAt || "").localeCompare(String(a?.CreatedAt || "")));
}

export function demoCreateSigningFile({ caseId, clientId, fileName, fileKey, requireOtp }) {
    const s = getDemoState();
    if (!s) return null;

    const cs = caseId ? s.casesById.get(Number(caseId)) : null;
    const client = clientId ? s.customersById.get(Number(clientId)) : null;

    const signingFileId = `sf_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const created = {
        SigningFileId: signingFileId,
        FileName: fileName || "מסמך חתימה (הדגמה).pdf",
        FileKey: fileKey || null,
        CaseId: cs?.CaseId ?? (caseId ?? null),
        CaseName: cs?.CaseName || (caseId ? `תיק ${caseId}` : "ללא תיק"),
        ClientName: client?.Name || cs?.CustomerName || "לקוח הדגמה",
        Status: "pending",
        CreatedAt: nowIso(),
        SignedAt: null,
        RequireOtp: Boolean(requireOtp),
        OtpEnabled: true,
        TotalSpots: 2,
        SignedSpots: 0,
        signatureSpots: [],
    };

    s.signingFilesById.set(signingFileId, created);
    notify({ type: "signingFiles/create", id: signingFileId });
    return created;
}

export function demoUpdateSigningStatus(signingFileId, status) {
    const s = getDemoState();
    if (!s) return null;

    const id = String(signingFileId);
    const current = s.signingFilesById.get(id);
    if (!current) return null;

    const next = { ...current, Status: status };
    if (status === "signed") {
        next.SignedAt = nowIso();
        next.SignedSpots = Number(next.TotalSpots || 0);
        if (!s.evidencePackagesBySigningFileId.has(id)) {
            const zipBlob = makeZipLikeBlob(`evidence for ${id}`);
            const certBlob = makeMinimalPdfBlob(`תעודת ראיות - ${id}`);
            s.evidencePackagesBySigningFileId.set(id, {
                evidenceId: `ev_${nextId("evidence")}`,
                signingFileId: id,
                caseId: next.CaseId,
                clientDisplayName: next.ClientName,
                caseDisplayName: next.CaseName,
                documentDisplayName: next.FileName,
                signedAtUtc: next.SignedAt,
                otpPolicy: { requireOtp: Boolean(next.RequireOtp), waivedBy: "" },
                evidenceZipBlob: zipBlob,
                evidencePdfBlob: certBlob,
                createdAt: next.SignedAt,
            });
        }
    }
    if (status === "rejected") {
        next.RejectionReason = next.RejectionReason || "הלקוח דחה";
    }

    s.signingFilesById.set(id, next);
    notify({ type: "signingFiles/update", id });
    return next;
}

export function demoGetSigningFile(signingFileId) {
    const s = getDemoState();
    if (!s) return null;
    return s.signingFilesById.get(String(signingFileId)) || null;
}

export function demoGetEvidencePackage(signingFileId) {
    const s = getDemoState();
    if (!s) return null;
    return s.evidencePackagesBySigningFileId.get(String(signingFileId)) || null;
}

export function demoListEvidenceDocuments() {
    const s = getDemoState();
    if (!s) return [];
    return Array.from(s.evidencePackagesBySigningFileId.values())
        .filter(Boolean)
        .sort((a, b) => String(b?.signedAtUtc || "").localeCompare(String(a?.signedAtUtc || "")));
}
