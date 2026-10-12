import SigningSelect from './SigningSelect';
import React from 'react';
import useSigningLocale from './useSigningLocale';
import TemplateDocumentCondition from './TemplateDocumentCondition';

// Role IDs bind PDF fields. Reordering changes only the stage, never those bindings.
export default function TemplateRoles({ draft, onChange, roleId, onRoleId, native = false }) {
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
        <div className="lw-templates__roles lw-signingRoles">{draft.roles.map((role, index) => {
            const used = draft.documents.some(doc => doc.fields.some(field => field.roleId === role.id));
            return <div className={`lw-templates__role${draft.signingOrder === 'grouped' ? ' is-grouped' : ''}`} key={role.id}>
                <span>{number(index + 1)}</span>
                <label>{t('roleName')}<input aria-label={t('roleLabel', { index: number(index + 1) })} value={role.name} maxLength={80} dir="auto" onChange={event => update(role.id, { name: event.target.value })} /></label>
                <label>{t('audience')}<SigningSelect dir={direction} value={['shared', 'lawyer'].includes(role.kind) ? role.kind : 'custom'} onChange={event => update(role.id, { kind: event.target.value })}>
                    <option value="custom">{t('each')}</option>
                    <option value="shared">{t('shared')}</option>
                    {role.kind === 'lawyer' && <option value="lawyer">{t('professional')}</option>}
                </SigningSelect></label>
                {draft.signingOrder === 'grouped' && <label>{translate('signingV2.compose.order.stageFor', { name: role.name })}
                    <SigningSelect dir={direction} value={draft.signingGroups.findIndex(group => group.includes(role.id))} onChange={event => {
                        const groups = draft.signingGroups.map(group => group.filter(key => key !== role.id));
                        (groups[Number(event.target.value)] ||= []).push(role.id);
                        onChange({ signingGroups: groups.filter(group => group.length) });
                    }}>
                        {draft.signingGroups.map((_, stage) => <option key={stage} value={stage}>{translate('signingV2.compose.order.stage', { number: number(stage + 1) })}</option>)}
                        {draft.signingGroups.length < draft.roles.length && <option value={draft.signingGroups.length}>{translate('signingV2.compose.order.newStage')}</option>}
                    </SigningSelect></label>}
                <div className="lw-templates__roleActions">
                    {draft.signingOrder === 'sequential' && <>
                        <button type="button" disabled={index === 0} className="lw-signingRoles__move" aria-label={t('up', { name: role.name })} title={t('up', { name: role.name })} onClick={() => move(index, index - 1)}><span aria-hidden="true">&#x25B2;</span></button>
                        <button type="button" disabled={index === draft.roles.length - 1} className="lw-signingRoles__move" aria-label={t('down', { name: role.name })} title={t('down', { name: role.name })} onClick={() => move(index, index + 1)}><span aria-hidden="true">&#x25BC;</span></button>
                    </>}
                    <button type="button" disabled={draft.roles.length === 1 || used} title={used ? t('removeRoleHint') : undefined} onClick={() => {
                        const roles = draft.roles.filter(item => item.id !== role.id);
                        onChange({ roles, ...(draft.signingGroups ? { signingGroups: draft.signingGroups.map(group => group.filter(key => key !== role.id)).filter(group => group.length) } : {}) });
                        if (roleId === role.id) onRoleId(roles[0].id);
                    }}>{t('removeRole')}</button>
                </div>
                {native && <label className="lw-templates__roleCondition">{translate('signingV2.authority.capacity')}
                    <SigningSelect dir={direction} value={role.nativeRole?.capacity || 'personal'} onChange={event => update(role.id, { nativeRole: { ...role.nativeRole, capacity: event.target.value } })}>
                        {['personal','professional','representative'].map(value => <option key={value} value={value}>{translate(`signingV2.authority.capacities.${value}`)}</option>)}
                    </SigningSelect>
                    {role.nativeRole?.capacity === 'representative' && <small>{translate('signingV2.authority.templateHelp')}</small>}
                </label>}
                {native && <details className="lw-templates__roleCondition"><summary>{translate('signingV2.people.templateOptions')}</summary>
                    <p>{translate('signingV2.people.slotHelp')}</p>
                    <div className="lw-templates__setup">
                        <label>{translate('signingV2.people.minimum')}<SigningSelect dir={direction} value={role.nativeRole?.min ?? 1}
                            onChange={event => update(role.id, { nativeRole: { ...role.nativeRole, min: Number(event.target.value) } })}>
                            {Array.from({ length: (role.nativeRole?.max ?? 1) + 1 }, (_, count) => <option value={count} key={count}>{number(count)}</option>)}
                        </SigningSelect></label>
                        <label>{translate('signingV2.people.maximum')}<SigningSelect dir={direction} value={role.nativeRole?.max ?? 1}
                            onChange={event => update(role.id, { nativeRole: { ...role.nativeRole, max: Number(event.target.value) } })}>
                            {Array.from({ length: 8 }, (_, index) => index + 1).map(count => <option value={count} key={count}
                                disabled={count < (role.nativeRole?.min ?? 1) || count + draft.roles.filter(item => item.id !== role.id).reduce((total, item) => total + (item.nativeRole?.max ?? 1), 0) > 8 || draft.documents.some(doc => doc.fields.some(field => field.roleId === role.id && (field.occurrence ?? field.nativeField?.occurrence ?? 0) >= count))}>{number(count)}</option>)}
                        </SigningSelect></label>
                    </div>
                </details>}
                {native && <div className="lw-templates__roleCondition"><TemplateDocumentCondition kind="role" fields={draft.dataKeys || []} condition={role.nativeRole?.when}
                    onChange={when => update(role.id, { nativeRole: { ...role.nativeRole, when } })} /></div>}
            </div>;
        })}</div>
        <button type="button" disabled={draft.roles.length >= 8 || (native && draft.roles.reduce((total, role) => total + (role.nativeRole?.max ?? 1), 0) >= 8)} onClick={() => {
            const id = `role_${crypto.randomUUID().slice(0, 8)}`;
            onChange({ roles: [...draft.roles, { id, name: t('roleDefault', { index: number(draft.roles.length + 1) }), kind: 'custom' }],
                ...(draft.signingGroups ? { signingGroups: [...draft.signingGroups, [id]] } : {}) });
        }}>{t('addRole')}</button>
        <p className="lw-templates__hint">{t('sharedHint')}</p>
    </section>;
}
