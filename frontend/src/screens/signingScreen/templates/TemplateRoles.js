import React from 'react';
import useSigningLocale from './useSigningLocale';

// Role IDs bind PDF fields. Reordering changes only the stage, never those bindings.
export default function TemplateRoles({ draft, onChange, roleId, onRoleId }) {
    const { t: translate, number } = useSigningLocale();
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
            return <div className="lw-templates__role" key={role.id}>
                <span>{number(index + 1)}</span>
                <label>{t('roleName')}<input aria-label={t('roleLabel', { index: number(index + 1) })} value={role.name} maxLength={80} dir="auto" onChange={event => update(role.id, { name: event.target.value })} /></label>
                <label>{t('audience')}<select value={['shared', 'lawyer'].includes(role.kind) ? role.kind : 'custom'} onChange={event => update(role.id, { kind: event.target.value })}>
                    <option value="custom">{t('each')}</option>
                    <option value="shared">{t('shared')}</option>
                    {role.kind === 'lawyer' && <option value="lawyer">{t('professional')}</option>}
                </select></label>
                <div className="lw-templates__roleActions">
                    {draft.signingOrder === 'sequential' && <>
                        <button type="button" disabled={index === 0} aria-label={t('up', { name: role.name })} onClick={() => move(index, index - 1)}>{t('earlier')}</button>
                        <button type="button" disabled={index === draft.roles.length - 1} aria-label={t('down', { name: role.name })} onClick={() => move(index, index + 1)}>{t('later')}</button>
                    </>}
                    <button type="button" disabled={draft.roles.length === 1 || used} title={used ? t('removeRoleHint') : undefined} onClick={() => {
                        const roles = draft.roles.filter(item => item.id !== role.id);
                        onChange({ roles });
                        if (roleId === role.id) onRoleId(roles[0].id);
                    }}>{t('removeRole')}</button>
                </div>
            </div>;
        })}</div>
        <button type="button" disabled={draft.roles.length >= 8} onClick={() => onChange({ roles: [...draft.roles, {
            id: `role_${crypto.randomUUID().slice(0, 8)}`, name: t('roleDefault', { index: number(draft.roles.length + 1) }), kind: 'custom',
        }] })}>{t('addRole')}</button>
        <p className="lw-templates__hint">{t('sharedHint')}</p>
    </section>;
}
