export function caseClientNames(caseItem) {
    if (Array.isArray(caseItem?.Users) && caseItem.Users.length > 0) {
        return caseItem.Users.map((u) => u.Name).filter(Boolean).join(', ');
    }
    return caseItem?.CustomerName || '';
}

export function caseMenuTitle(caseItem) {
    const parts = [caseItem?.CaseName, caseClientNames(caseItem)];
    const company = String(caseItem?.CompanyName || '').trim();
    if (company) parts.push(company);
    return parts.filter(Boolean).join(' - ');
}
