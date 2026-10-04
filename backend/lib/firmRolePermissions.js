/**
 * Versioned permission catalog — defines what can be assigned to a role.
 * Role names (e.g. "מזכירה") are labels only; no semantic defaults by name.
 */
const CATALOG_VERSION = 1;

/** @typedef {'all_firm' | 'assigned_only'} CasesDataScope */

/**
 * @typedef {Object} AreaDefinition
 * @property {string} id
 * @property {string} pageKey nav / session-scope page id
 * @property {string[]} [navKeys] additional nav keys tied to this area
 * @property {string[]} [actions]
 * @property {boolean} [supportsDataScope]
 */

/** @type {AreaDefinition[]} */
const PERMISSION_AREAS = Object.freeze([
    {
        id: 'main',
        pageKey: 'main',
        navKeys: ['main'],
        actions: [],
        supportsDataScope: false,
    },
    {
        id: 'cases',
        pageKey: 'allCases',
        navKeys: ['allCases', 'newOrUpdateCase', 'taggedCases', 'myCases'],
        actions: ['view', 'create', 'edit', 'delete', 'tag'],
        supportsDataScope: true,
    },
    {
        id: 'caseTypes',
        pageKey: 'allCaseTypes',
        navKeys: ['allCaseTypes'],
        actions: ['view', 'manage'],
        supportsDataScope: false,
    },
    {
        id: 'clients',
        pageKey: 'allClients',
        navKeys: ['allClients'],
        actions: ['view', 'edit', 'delete'],
        supportsDataScope: false,
    },
    {
        id: 'signing',
        pageKey: 'signingFiles',
        navKeys: ['signingFiles', 'uploadFileForSigning'],
        actions: ['view', 'manage', 'upload'],
        supportsDataScope: false,
    },
    {
        id: 'reminders',
        pageKey: 'reminders',
        navKeys: ['reminders'],
        actions: ['view', 'manage'],
        supportsDataScope: false,
    },
    {
        id: 'calendar',
        pageKey: 'calendar',
        navKeys: ['calendar'],
        actions: ['view', 'manage'],
        supportsDataScope: false,
    },
    {
        id: 'support',
        pageKey: 'support',
        navKeys: ['support'],
        actions: ['view'],
        supportsDataScope: false,
    },
]);

const AREA_BY_ID = Object.freeze(
    Object.fromEntries(PERMISSION_AREAS.map((a) => [a.id, a])),
);

const ALL_PAGE_KEYS = Object.freeze([
    ...new Set(PERMISSION_AREAS.flatMap((a) => [a.pageKey, ...(a.navKeys || [])])),
]);

const ALL_ACTION_KEYS = Object.freeze(
    Object.fromEntries(
        PERMISSION_AREAS.filter((a) => a.actions?.length).map((a) => [a.id, Object.freeze([...a.actions])]),
    ),
);

/**
 * @param {unknown} raw
 * @returns {{ version: number, areas: Record<string, { visible: boolean, actions: string[], dataScope?: string }> }}
 */
function normalizeRolePermissions(raw) {
    const areas = {};
    for (const def of PERMISSION_AREAS) {
        const src =
            raw && typeof raw === 'object' && raw.areas && typeof raw.areas === 'object'
                ? raw.areas[def.id]
                : null;
        const visible = Boolean(src?.visible);
        const actionSet = new Set(def.actions || []);
        const actions = Array.isArray(src?.actions)
            ? src.actions.filter((x) => typeof x === 'string' && actionSet.has(x))
            : [];
        let dataScope = undefined;
        if (def.supportsDataScope && visible) {
            const ds = src?.dataScope;
            dataScope = ds === 'all_firm' || ds === 'assigned_only' ? ds : 'assigned_only';
        }
        areas[def.id] = { visible, actions, ...(dataScope ? { dataScope } : {}) };
    }
    return { version: CATALOG_VERSION, areas };
}

function getCatalogForApi() {
    return {
        version: CATALOG_VERSION,
        areas: PERMISSION_AREAS.map((a) => ({
            id: a.id,
            pageKey: a.pageKey,
            navKeys: a.navKeys || [a.pageKey],
            actions: a.actions || [],
            supportsDataScope: Boolean(a.supportsDataScope),
            dataScopeOptions: a.supportsDataScope ? ['all_firm', 'assigned_only'] : [],
        })),
    };
}

/**
 * Nav keys that represent routes/popups requiring specific actions (not implied by area.visible alone).
 * @type {Record<string, (areaId: string, area: { visible: boolean, actions: string[] }) => boolean>}
 */
const NAV_KEY_ACTION_RULES = Object.freeze({
    newOrUpdateCase: (_areaId, area) =>
        (area.actions || []).includes('create') || (area.actions || []).includes('edit'),
    uploadFileForSigning: (_areaId, area) =>
        (area.actions || []).includes('upload') || (area.actions || []).includes('manage'),
});

function navKeyAllowedForArea(def, area, navKey) {
    if (!area?.visible) return false;
    const rule = NAV_KEY_ACTION_RULES[navKey];
    if (rule) return rule(def.id, area);
    return true;
}

/**
 * @param {{ version: number, areas: Record<string, { visible: boolean, actions: string[], dataScope?: string }> }} perms
 */
function listVisiblePageKeys(perms) {
    const pages = new Set();
    for (const def of PERMISSION_AREAS) {
        const area = perms.areas[def.id];
        if (!area?.visible) continue;
        if (navKeyAllowedForArea(def, area, def.pageKey)) {
            pages.add(def.pageKey);
        }
        for (const k of def.navKeys || []) {
            if (k === def.pageKey) continue;
            if (navKeyAllowedForArea(def, area, k)) pages.add(k);
        }
    }
    return [...pages];
}

function isAreaVisible(perms, areaId) {
    return Boolean(perms?.areas?.[areaId]?.visible);
}

function hasAreaAction(perms, areaId, action) {
    if (!isAreaVisible(perms, areaId)) return false;
    const allowed = perms.areas[areaId].actions || [];
    return allowed.includes(action);
}

/** @returns {'all_firm' | 'assigned_only'} */
function getCasesDataScope(perms) {
    const area = perms?.areas?.cases;
    if (!area?.visible) return 'assigned_only';
    return area.dataScope === 'all_firm' ? 'all_firm' : 'assigned_only';
}

function buildSessionScopeFromPermissions(perms, roleName) {
    return {
        catalogVersion: CATALOG_VERSION,
        permissionMode: 'role',
        roleName: roleName || null,
        pages: listVisiblePageKeys(perms),
        areas: perms.areas,
        casesDataScope: getCasesDataScope(perms),
    };
}

function buildPlatformAdminSessionScope() {
    return {
        catalogVersion: CATALOG_VERSION,
        permissionMode: 'platform_admin',
        roleName: null,
        pages: [...ALL_PAGE_KEYS],
        areas: null,
        casesDataScope: 'all_firm',
    };
}

function buildLegacySessionScope() {
    return {
        catalogVersion: CATALOG_VERSION,
        permissionMode: 'legacy',
        roleName: null,
        pages: null,
        areas: null,
        casesDataScope: null,
    };
}

module.exports = {
    CATALOG_VERSION,
    PERMISSION_AREAS,
    AREA_BY_ID,
    ALL_PAGE_KEYS,
    ALL_ACTION_KEYS,
    normalizeRolePermissions,
    getCatalogForApi,
    listVisiblePageKeys,
    navKeyAllowedForArea,
    NAV_KEY_ACTION_RULES,
    isAreaVisible,
    hasAreaAction,
    getCasesDataScope,
    buildSessionScopeFromPermissions,
    buildPlatformAdminSessionScope,
    buildLegacySessionScope,
};
