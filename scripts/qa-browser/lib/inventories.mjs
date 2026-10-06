/** Static control inventory derived from source (AllCases, CaseFullView, CaseMenuItem, MyCases, TaggedCases). */

export function buildCasesInventory(inv) {
  const screens = [
    "AllCasesScreen",
    "MyCasesScreen",
    "TaggedCasesScreen",
    "CaseFullView",
    "CaseMenuItem",
    "CaseMenuItemOpen",
  ];
  const rows = [
    ["allCases.filter.status", "AllCasesScreen", "סינון סטטוס (פתוח/סגור/הכל)", "filter", "cases.view"],
    ["allCases.filter.caseType", "AllCasesScreen", "סינון סוג תיק", "filter", "cases.view"],
    ["allCases.filter.manager", "AllCasesScreen", "סינון מנהל תיק", "filter", "cases.view"],
    ["allCases.search.caseName", "AllCasesScreen", "חיפוש שם תיק", "search", "cases.view"],
    ["allCases.search.client", "AllCasesScreen", "חיפוש לקוח", "search", "cases.view"],
    ["allCases.search.company", "AllCasesScreen", "חיפוש חברה", "search", "cases.view"],
    ["allCases.card.open", "CaseMenuItem", "פתיחת כרטיס תיק", "navigation", "cases.view"],
    ["allCases.card.expand", "CaseMenuItemOpen", "הרחבת שלבי תיק", "toggle", "cases.view"],
    ["allCases.card.advanceStage", "CaseMenuItemOpen", "קידום שלב", "mutation", "cases.edit"],
    ["allCases.card.editPopup", "CaseMenuItem", "עריכת תיק (פופאפ)", "navigation", "cases.view"],
    ["allCases.card.licenseExpiry", "CaseMenuItem", "עדכון תוקף רישיון", "mutation", "cases.edit"],
    ["caseFull.field.caseName", "CaseFullView", "שם תיק", "input", "cases.edit"],
    ["caseFull.field.caseType", "CaseFullView", "סוג תיק", "select", "cases.edit"],
    ["caseFull.field.customer", "CaseFullView", "לקוח", "select", "cases.edit"],
    ["caseFull.field.phone", "CaseFullView", "טלפון", "input", "cases.edit"],
    ["caseFull.field.email", "CaseFullView", "אימייל", "input", "cases.edit"],
    ["caseFull.field.company", "CaseFullView", "חברה", "input", "cases.edit"],
    ["caseFull.field.manager", "CaseFullView", "מנהל תיק", "select", "cases.edit"],
    ["caseFull.field.currentStage", "CaseFullView", "שלב נוכחי", "input", "cases.edit"],
    ["caseFull.field.estimatedDate", "CaseFullView", "תאריך משוער", "date", "cases.edit"],
    ["caseFull.field.licenseExpiry", "CaseFullView", "תוקף רישיון", "date", "cases.edit"],
    ["caseFull.stage.add", "CaseFullView", "הוספת שלב", "mutation", "cases.edit"],
    ["caseFull.stage.remove", "CaseFullView", "הסרת שלב", "mutation", "cases.edit"],
    ["caseFull.stage.reorder", "CaseFullView", "שינוי סדר שלבים", "mutation", "cases.edit"],
    ["caseFull.stage.text", "CaseFullView", "טקסט שלב", "textarea", "cases.edit"],
    ["caseFull.btn.save", "CaseFullView", "שמירה", "button", "cases.create|edit"],
    ["caseFull.btn.update", "CaseFullView", "עדכון", "button", "cases.edit"],
    ["caseFull.btn.delete", "CaseFullView", "מחיקת תיק", "button", "cases.delete"],
    ["caseFull.btn.cancel", "CaseFullView", "ביטול", "button", "cases.view"],
    ["caseFull.btn.addClient", "CaseFullView", "הוספת לקוח מהטופס", "popup", "clients.create"],
    ["myCases.search", "MyCasesScreen", "חיפוש", "search", "cases.view"],
    ["myCases.filter.status", "MyCasesScreen", "סינון סטטוס", "filter", "cases.view"],
    ["myCases.filter.type", "MyCasesScreen", "סינון סוג", "filter", "cases.view"],
    ["myCases.filter.client", "MyCasesScreen", "סינון לקוח", "filter", "cases.view"],
    ["myCases.filter.manager", "MyCasesScreen", "סינון מנהל", "filter", "cases.view"],
    ["myCases.filter.company", "MyCasesScreen", "סינון חברה", "filter", "cases.view"],
    ["tagged.filter.status", "TaggedCasesScreen", "סינון סטטוס", "filter", "cases.view"],
    ["tagged.filter.type", "TaggedCasesScreen", "סינון סוג", "filter", "cases.view"],
    ["tagged.btn.addTag", "TaggedCasesScreen", "הוספת תיק מסומן", "button", "cases.edit"],
    ["tagged.search.caseName", "TaggedCasesScreen", "חיפוש שם", "search", "cases.view"],
  ];
  for (const [controlId, screen, label, type, permission] of rows) {
    inv.add({
      controlId,
      screen,
      label,
      type,
      permission,
      expectedBehavior: type === "mutation" ? "Role A blocked; Role B allowed" : "Visible when permitted",
    });
  }
  return { screens: [...new Set(screens)], count: rows.length };
}

export function buildClientsInventory(inv) {
  const rows = [
    ["clients.search.name", "AllClientsScreen", "חיפוש שם", "search", "clients.view"],
    ["clients.search.company", "AllClientsScreen", "חיפוש חברה", "search", "clients.view"],
    ["clients.search.phone", "AllClientsScreen", "חיפוש טלפון", "search", "clients.view"],
    ["clients.btn.add", "AllClientsScreen", "הוספת לקוח", "button", "clients.edit"],
    ["clients.btn.import", "AllClientsScreen", "ייבוא לקוחות", "button", "clients.edit"],
    ["clients.card.open", "ClientsCard", "פתיחת לקוח", "navigation", "clients.view"],
    ["clients.card.edit", "ClientMenuItem", "עריכה", "button", "clients.edit"],
    ["clients.card.delete", "ClientMenuItem", "מחיקה", "button", "clients.delete"],
    ["clientPopup.field.name", "ClientPopup", "שם", "input", "clients.edit"],
    ["clientPopup.field.company", "ClientPopup", "חברה", "input", "clients.edit"],
    ["clientPopup.field.phone", "ClientPopup", "טלפון", "input", "clients.edit"],
    ["clientPopup.field.email", "ClientPopup", "אימייל", "input", "clients.edit"],
    ["clientPopup.field.dob", "ClientPopup", "תאריך לידה", "date", "clients.edit"],
    ["clientPopup.btn.save", "ClientPopup", "שמירה", "button", "clients.edit"],
    ["clientPopup.btn.cancel", "ClientPopup", "ביטול", "button", "clients.view"],
    ["clientPopup.search.name", "ClientPopup", "אוטocomplete שם", "search", "clients.view"],
    ["clientPopup.search.company", "ClientPopup", "autocomplete חברה", "search", "clients.view"],
    ["importModal.file", "ImportClientsModal", "בחירת קובץ", "file", "clients.edit"],
    ["importModal.cancel", "ImportClientsModal", "ביטול", "button", "clients.edit"],
  ];
  for (const [controlId, screen, label, type, permission] of rows) {
    inv.add({
      controlId,
      screen,
      label,
      type,
      permission,
      expectedBehavior: "Validation per backend + permission gates",
    });
  }
  return { screens: ["AllClientsScreen", "ClientsCard", "ClientPopup", "ImportClientsModal"], count: rows.length };
}
