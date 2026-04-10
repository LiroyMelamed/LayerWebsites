import { useMemo } from "react";

const DEMO_KEY = 'lw_demo';

// Check once at module load so it works even outside React
const _initDemo = (() => {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('demo') === '1' || params.get('demo') === 'true';
        if (fromUrl) { sessionStorage.setItem(DEMO_KEY, '1'); return true; }
        return sessionStorage.getItem(DEMO_KEY) === '1';
    } catch { return false; }
})();

export function isDemoMode() {
    return _initDemo;
}

export function useDemoMode() {
    return useMemo(() => _initDemo, []);
}

export const DEMO_ADMIN_DATA = {
    AllCasesData: Array.from({ length: 47 }, (_, i) => ({
        caseid: i + 1,
        isclosed: i >= 35,
        istagged: i < 5,
        casemanagerid: 1,
    })),
    NumberOfClosedCases: 12,
    NumberOfTaggedCases: 5,
    AllCustomersData: Array.from({ length: 31 }, (_, i) => ({
        userid: i + 100,
        name: `לקוח ${i + 1}`,
        email: `client${i + 1}@example.com`,
        phonenumber: `050-000-${String(i).padStart(4, "0")}`,
        companyname: i % 3 === 0 ? `חברה ${i + 1}` : null,
        createdat: new Date(2025, 6, i + 1).toISOString(),
        dateofbirth: null,
        profilepicurl: null,
    })),
    ActiveCustomers: Array.from({ length: 22 }, (_, i) => ({
        userid: i + 100,
        name: `לקוח ${i + 1}`,
        email: `client${i + 1}@example.com`,
        phonenumber: `050-000-${String(i).padStart(4, "0")}`,
        companyname: i % 3 === 0 ? `חברה ${i + 1}` : null,
        createdat: new Date(2025, 6, i + 1).toISOString(),
        dateofbirth: null,
        profilepicurl: null,
    })),
};

const caseTypes = ["נזיקין", "דיני עבודה", "מקרקעין", "פלילי", "משפחה"];
const stages = ["פתיחת תיק", "איסוף מסמכים", "הגשת תביעה", "דיון ראשון", "גישור", "סיכומים"];
const managers = ["עו\"ד ליאב מלמד", "עו\"ד דנה כהן", "עו\"ד יוסי לוי"];

function buildDescriptions(currentStageIdx, isClosed) {
    return stages.map((text, si) => ({
        Text: text,
        Timestamp: si < currentStageIdx || isClosed ? new Date(2026, 0 + si, 10 + si).toISOString() : null,
        IsNew: false,
    }));
}

export const DEMO_CASES = Array.from({ length: 47 }, (_, i) => {
    const isClosed = i >= 35;
    const currentStage = isClosed ? stages.length : (i % stages.length) + 1;
    return {
        CaseId: i + 1,
        CaseName: `תיק ${i + 1} – ${caseTypes[i % caseTypes.length]}`,
        CaseTypeName: caseTypes[i % caseTypes.length],
        IsClosed: isClosed,
        IsTagged: i < 5,
        CurrentStage: currentStage,
        Descriptions: buildDescriptions(currentStage, isClosed),
        CreatedAt: new Date(2025, 6, i + 1).toISOString(),
        CaseManager: managers[i % managers.length],
        CustomerName: `לקוח ${i + 1}`,
        Users: [{ Name: `לקוח ${i + 1}` }],
        PhoneNumber: `050-000-${String(i).padStart(4, "0")}`,
        CompanyName: i % 3 === 0 ? `חברה ${i + 1}` : null,
        EstimatedCompletionDate: isClosed ? null : new Date(2026, 3 + (i % 6), 15).toISOString(),
        LicenseExpiryDate: null,
    };
});

export const DEMO_CASE_TYPES = [...new Set(DEMO_CASES.map(c => c.CaseTypeName))];

export const DEMO_CLIENT_CASES = Array.from({ length: 3 }, (_, i) => {
    const isClosed = i === 2;
    const currentStage = isClosed ? stages.length : (i % stages.length) + 1;
    return {
        CaseId: i + 1,
        CaseName: `תיק ${i + 1} – ${caseTypes[i % caseTypes.length]}`,
        CaseTypeName: caseTypes[i % caseTypes.length],
        IsClosed: isClosed,
        CurrentStage: currentStage,
        Descriptions: buildDescriptions(currentStage, isClosed),
        CreatedAt: new Date(2025, 9, i + 1).toISOString(),
        CaseManager: managers[0],
        CustomerName: "ישראל ישראלי",
        Users: [{ Name: "ישראל ישראלי" }],
        PhoneNumber: "050-123-4567",
        CompanyName: null,
    };
});

export const DEMO_CLIENT_DATA = {
    totalCases: 3,
    openCases: 2,
    closedCases: 1,
    unreadNotifications: 1,
};

// ── Case types (admin) ──
export const DEMO_ALL_CASE_TYPES = caseTypes.map((name, i) => ({
    CaseTypeId: i + 1,
    CaseTypeName: name,
    CaseType: name,
    NumberOfStages: stages.length,
}));

// ── Customers (admin) ──
export const DEMO_ALL_CUSTOMERS = Array.from({ length: 31 }, (_, i) => ({
    UserId: i + 100,
    Name: `לקוח ${i + 1}`,
    Email: `client${i + 1}@example.com`,
    PhoneNumber: `050-000-${String(i).padStart(4, "0")}`,
    CompanyName: i % 3 === 0 ? `חברה ${i + 1}` : null,
    CreatedAt: new Date(2025, 6, i + 1).toISOString(),
    DateOfBirth: null,
    ProfilePicUrl: null,
}));

// ── Admins (admin) ──
export const DEMO_ADMINS = [
    { name: "עו\"ד ליאב מלמד", email: "liav@melamedlaw.co.il", phonenumber: "050-111-1111", createdat: new Date(2024, 0, 1).toISOString() },
    { name: "עו\"ד דנה כהן", email: "dana@melamedlaw.co.il", phonenumber: "050-222-2222", createdat: new Date(2024, 6, 1).toISOString() },
    { name: "עו\"ד יוסי לוי", email: "yossi@melamedlaw.co.il", phonenumber: "050-333-3333", createdat: new Date(2025, 0, 15).toISOString() },
];

// ── Signing files (admin/lawyer view) ──
const signingFileNames = ["הסכם שכירות.pdf", "ייפוי כוח.pdf", "כתב תביעה.pdf", "הסכם גירושין.pdf", "צוואה.pdf"];
export const DEMO_LAWYER_SIGNING_FILES = {
    files: Array.from({ length: 8 }, (_, i) => ({
        SigningFileId: i + 1,
        FileName: signingFileNames[i % signingFileNames.length],
        CaseName: `תיק ${i + 1} – ${caseTypes[i % caseTypes.length]}`,
        ClientName: `לקוח ${i + 1}`,
        Status: i < 5 ? "pending" : "signed",
        CreatedAt: new Date(2026, 2, i + 1).toISOString(),
        SignedAt: i >= 5 ? new Date(2026, 2, i + 5).toISOString() : null,
        TotalSpots: 3,
        SignedSpots: i >= 5 ? 3 : 0,
        RejectionReason: null,
        CaseId: i + 1,
    })),
};

// ── Signing files (client view) ──
export const DEMO_CLIENT_SIGNING_FILES = {
    files: [
        { SigningFileId: 1, FileName: "הסכם שכירות.pdf", CaseName: "תיק 1 – נזיקין", LawyerName: "עו\"ד ליאב מלמד", Status: "pending", CreatedAt: new Date(2026, 2, 10).toISOString(), TotalSpots: 2, SignedSpots: 0, Notes: "נא לחתום עד סוף השבוע" },
        { SigningFileId: 2, FileName: "ייפוי כוח.pdf", CaseName: "תיק 2 – דיני עבודה", LawyerName: "עו\"ד ליאב מלמד", Status: "signed", CreatedAt: new Date(2026, 1, 15).toISOString(), TotalSpots: 3, SignedSpots: 3, Notes: null },
    ],
};

// ── Reminders (admin) ──
export const DEMO_REMINDERS = {
    reminders: [
        { ReminderId: 1, CaseName: "תיק 3 – מקרקעין", ClientName: "לקוח 3", TemplateKey: "court_date", ScheduledAt: new Date(2026, 3, 20, 9, 0).toISOString(), Status: "PENDING", Channel: "whatsapp" },
        { ReminderId: 2, CaseName: "תיק 1 – נזיקין", ClientName: "לקוח 1", TemplateKey: "document_reminder", ScheduledAt: new Date(2026, 3, 5, 14, 0).toISOString(), Status: "SENT", Channel: "sms" },
        { ReminderId: 3, CaseName: "תיק 5 – משפחה", ClientName: "לקוח 5", TemplateKey: "payment_reminder", ScheduledAt: new Date(2026, 2, 28, 10, 0).toISOString(), Status: "SENT", Channel: "whatsapp" },
    ],
    total: 3,
};

// ── Notifications (client) ──
export const DEMO_NOTIFICATIONS = [
    { notificationid: 1, message: "שלב חדש בתיק 1 – נזיקין: הגשת תביעה", createdat: new Date(2026, 3, 9, 10, 30).toISOString(), type: "stage_advance" },
    { notificationid: 2, message: "מסמך חדש לחתימה: הסכם שכירות.pdf", createdat: new Date(2026, 3, 8, 14, 0).toISOString(), type: "signing_request" },
    { notificationid: 3, message: "תזכורת: דיון בבית משפט ב-20/04/2026", createdat: new Date(2026, 3, 7, 9, 0).toISOString(), type: "reminder" },
];

// ── Profile (client) ──
export const DEMO_PROFILE = {
    Name: "ישראל ישראלי",
    Email: "israel@example.com",
    PhoneNumber: "050-123-4567",
    CompanyName: "",
    DateOfBirth: "1990-05-15",
    PhotoKey: null,
    ProfilePicUrl: null,
    ProfilePicReadUrl: null,
};
