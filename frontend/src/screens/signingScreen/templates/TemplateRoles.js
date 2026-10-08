import React from 'react';
import useSigningLocale from './useSigningLocale';

// Role IDs bind PDF fields. Reordering changes only the stage, never those bindings.
export default function TemplateRoles({ draft, onChange, roleId, onRoleId }) {
    const { t: translate, number, direction } = useSigningLocale();
    const t = (key, values) => translate(`signingV2.builder.${key}`, values);
    const update = (id, patch) => onChange({ roles: draft.roles.map(role => role.id === id ? { ...role, ...patch } : role) });
    const move = (from, to) => {
        const roles = [...draft.roles];
        roles.splice(to, 0, roles.splice(from, 1)[0]);
        onChange({ roles });
    };
    return <section aria-labelledby="template-roles-title">
        <h2 id="template-roles-title">{t('roles')}</h2>
        <p>{t('rolesHint')}</p>
        {draft.signingOrder === 'sequential' && <p>{t('orderHint')}</p>}
        <div className="lw-templates__roles">{draft.roles.map((role, index) => {
            const used = draft.documents.some(doc => doc.fields.some(field => field.roleId === role.id));
            return <div className={`lw-templates__role${draft.signingOrder === 'grouped' ? ' is-grouped' : ''}`} key={role.id}>
                <span>{number(index + 1)}</span>
                <label>{t('roleName')}<input aria-label={t('roleLabel', { index: number(index + 1) })} value={role.name} maxLength={80} dir="auto" onChange={event => update(role.id, { name: event.target.value })} /></label>
                <label>{t('audience')}<select dir={direction} value={['shared', 'lawyer'].includes(role.kind) ? role.kind : 'custom'} onChange={event => update(role.id, { kind: event.target.value })}>
                    <option value="custom">{t('each')}</option>
                    <option value="shared">{t('shared')}</option>
                    {role.kind === 'lawyer' && <option value="lawyer">{t('professional')}</option>}
                </select></label>
                {draft.signingOrder === 'grouped' && <label>{translate('signingV2.compose.order.stageFor', { name: role.name })}
                    <select dir={direction} value={draft.signingGroups.findIndex(group => group.includes(role.id))} onChange={event => {
                        const groups = draft.signingGroups.map(group => group.filter(key => key !== role.id));
                        (groups[Number(event.target.value)] ||= []).push(role.id);
                        onChange({ signingGroups: groups.filter(group => group.length) });
                    }}>
                        {draft.signingGroups.map((_, stage) => <option key={stage} value={stage}>{translate('signingV2.compose.order.stage', { number: number(stage + 1) })}</option>)}
                        {draft.signingGroups.length < draft.roles.length && <option value={draft.signingGroups.length}>{translate('signingV2.compose.order.newStage')}</option>}
                    </select></label>}
                <div className="lw-templates__roleActions">
                    {draft.signingOrder === 'sequential' && <>
                        <button type="button" disabled={index === 0} aria-label={t('up', { name: role.name })} onClick={() => move(index, index - 1)}>{t('earlier')}</button>
                        <button type="button" disabled={index === draft.roles.length - 1} aria-label={t('down', { name: role.name })} onClick={() => move(index, index + 1)}>{t('later')}</button>
                    </>}
                    <button type="button" disabled={draft.roles.length === 1 || used} title={used ? t('removeRoleHint') : undefined} onClick={() => {
                        const roles = draft.roles.filter(item => item.id !== role.id);
                        onChange({ roles, ...(draft.signingGroups ? { signingGroups: draft.signingGroups.map(group => group.filter(key => key !== role.id)).filter(group => group.length) } : {}) });
                        if (roleId === role.id) onRoleId(roles[0].id);
                    }}>{t('removeRole')}</button>
                </div>
            </div>;
        })}</div>
        <button type="button" disabled={draft.roles.length >= 8} onClick={() => {
            const id = `role_${crypto.randomUUID().slice(0, 8)}`;
            onChange({ roles: [...draft.roles, { id, name: t('roleDefault', { index: number(draft.roles.length + 1) }), kind: 'custom' }],
                ...(draft.signingGroups ? { signingGroups: [...draft.signingGroups, [id]] } : {}) });
        }}>{t('addRole')}</button>
        <p className="lw-templates__hint">{t('sharedHint')}</p>
    </section>;
}
