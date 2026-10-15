import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, ArrowUpRight, CheckCheck } from 'lucide-react';
import SimpleCard from '../../../../components/simpleComponents/SimpleCard';
import Skeleton from '../../../../components/simpleComponents/Skeleton';
import SegmentedSwitch from '../../../../components/styledComponents/SegmentedSwitch';

export default function TeamActivityPanel({ activity, isPerforming }) {
    const { t, i18n } = useTranslation();
    const [period, setPeriod] = useState('week');
    const selected = activity?.periods?.[period];
    const leaders = selected?.leaders || [];
    const date = selected?.startsOn && new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'he-IL', {
        timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short',
    }).format(new Date(`${selected.startsOn}T12:00:00Z`));

    return <SimpleCard className="lw-teamActivity" aria-labelledby="team-activity-title">
        <div className="lw-businessHome__sectionTitle">
            <span className="lw-businessHome__icon"><Trophy size={20} aria-hidden="true" /></span>
            <div><h2 id="team-activity-title">{t('managerHome.team.title')}</h2><p>{t('managerHome.team.subtitle')}</p></div>
        </div>
        <SegmentedSwitch ariaLabel={t('managerHome.team.periodLabel')} value={period} onChange={setPeriod}
            options={['today', 'week', 'month'].map(value => ({ value, label: t(`managerHome.team.${value}`) }))} />
        <div aria-live="polite" aria-busy={isPerforming || undefined}>
            {isPerforming ? <Skeleton width="100%" height={230} borderRadius={12} /> : !selected ?
                <p className="lw-businessHome__empty">{t('managerHome.team.unavailable')}</p> : <>
                    <p className="lw-teamActivity__range">{t('managerHome.team.range', { date })}</p>
                    <div className="lw-teamActivity__momentum">
                        <span><ArrowUpRight size={16} aria-hidden="true" /><b>{selected.casesOpened}</b>{t('managerHome.team.opened')}</span>
                        <span><CheckCheck size={16} aria-hidden="true" /><b>{selected.casesClosed}</b>{t('managerHome.team.closed')}</span>
                    </div>
                    {leaders.length ? <ol className="lw-teamActivity__leaders" aria-label={t('managerHome.team.ranking')}>
                        {leaders.map(manager => <li key={manager.managerId} className={manager.rank === 1 ? 'is-leading' : ''}>
                            <span className="lw-teamActivity__rank" aria-label={t('managerHome.team.rank', { rank: manager.rank })}>{manager.rank}</span>
                            <div className="lw-teamActivity__person"><strong>{manager.managerName}</strong>
                                <span>{t('managerHome.team.breakdown', { updates: manager.caseUpdates, closed: manager.casesClosed })}</span></div>
                            <div className="lw-teamActivity__points"><b>{manager.points}</b><span>{t('managerHome.team.points')}</span></div>
                        </li>)}
                    </ol> : <p className="lw-businessHome__empty">{t('managerHome.team.empty')}</p>}
                </>}
        </div>
        <details className="lw-teamActivity__rules"><summary>{t('managerHome.team.rulesTitle')}</summary>
            <p>{t('managerHome.team.rules')}</p><p>{t('managerHome.team.periodRules')}</p></details>
    </SimpleCard>;
}
