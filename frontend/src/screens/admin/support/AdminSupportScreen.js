import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScreenSize } from '../../../providers/ScreenSizeProvider';
import {
  addSupportComment,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
} from '../../../api/supportApi';
import { AdminStackName } from '../../../navigation/AdminStack';
import { MainScreenName } from '../../mainScreen/MainScreen';
import SimpleScreen from '../../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../../components/simpleComponents/SimpleScrollView';
import SimpleContainer from '../../../components/simpleComponents/SimpleContainer';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import TopToolBarSmallScreen from '../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import { getNavBarData } from '../../../components/navBars/data/NavBarData';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import { Text12, Text14, TextBold14, TextBold24 } from '../../../components/specializedComponents/text/AllTextKindFile';
import { images } from '../../../assets/images/images';
import { getFirmName } from '../../../services/firmSettings';
import { showAppToast } from '../../../components/ui/showAppToast';
import './AdminSupportScreen.scss';

const STATUS_KEYS = {
  open: 'open',
  in_progress: 'inProgress',
  resolved: 'resolved',
  pr_created: 'resolved',
  closed: 'closed',
};

function statusClass(status) {
  const key = STATUS_KEYS[status] || 'open';
  if (key === 'inProgress') return 'in_progress';
  if (key === 'resolved') return 'resolved';
  if (key === 'closed') return 'closed';
  return 'open';
}

export default function AdminSupportScreen() {
  const { t } = useTranslation();
  const { isSmallScreen } = useScreenSize();
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const firmLabel = getFirmName() || process.env.REACT_APP_FIRM_NAME || 'MelamedLaw';

  const loadList = useCallback(async () => {
    const data = await listSupportTickets();
    setTickets(data.tickets || []);
  }, []);

  const loadDetail = useCallback(async (id) => {
    const data = await getSupportTicket(id);
    setDetail(data);
  }, []);

  useEffect(() => {
    loadList().catch((e) => setError(e?.message || String(e)));
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId).catch((e) => setError(e?.message || String(e)));
  }, [selectedId, loadDetail]);

  function statusLabel(status) {
    const key = STATUS_KEYS[status];
    return key ? t(`support.status.${key}`) : status;
  }

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createSupportTicket({ title, description });
      setTitle('');
      setDescription('');
      showAppToast({ type: 'success', text: t('support.createSuccess') });
      await loadList();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onComment(e) {
    e.preventDefault();
    if (!selectedId || !comment.trim()) return;
    setBusy(true);
    try {
      await addSupportComment(selectedId, comment);
      setComment('');
      showAppToast({ type: 'success', text: t('support.commentSuccess') });
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
      {isSmallScreen && (
        <TopToolBarSmallScreen
          LogoNavigate={AdminStackName + MainScreenName}
          GetNavBarData={getNavBarData}
          chosenNavKey="support"
        />
      )}

      <SimpleScrollView className="lw-adminSupport__scroll">
        <SimpleContainer className="lw-adminSupport__header">
          <Text12 className="lw-adminSupport__eyebrow">
            {t('support.eyebrow', { firm: firmLabel })}
          </Text12>
          <TextBold24>{t('support.title')}</TextBold24>
          <Text14 className="lw-adminSupport__subtitle">{t('support.subtitle')}</Text14>
        </SimpleContainer>

        {error ? (
          <SimpleCard className="lw-adminSupport__banner lw-adminSupport__banner--error">
            <TextBold14>{error}</TextBold14>
          </SimpleCard>
        ) : null}

        <SimpleCard className="lw-adminSupport__card">
          <TextBold14>{t('support.newTicket')}</TextBold14>
          <form className="lw-adminSupport__form" onSubmit={onCreate}>
            <SimpleInput
              className="lw-adminSupport__input"
              title={t('support.titleLabel')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
            />
            <SimpleTextArea
              className="lw-adminSupport__textarea"
              title={t('support.descriptionLabel')}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={3}
            />
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? t('support.sending') : t('support.submit')}
            </PrimaryButton>
          </form>
        </SimpleCard>

        <SimpleContainer className="lw-adminSupport__grid">
          <SimpleCard className="lw-adminSupport__card lw-adminSupport__listCard">
            <TextBold14>{t('support.ticketsHeading', { count: tickets.length })}</TextBold14>
            {tickets.length === 0 ? (
              <Text14 className="lw-adminSupport__empty">{t('support.noTickets')}</Text14>
            ) : (
              <ul className="lw-adminSupport__ticketList">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={`lw-adminSupport__ticketBtn${selectedId === ticket.id ? ' is-active' : ''}`}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <TextBold14>{ticket.title}</TextBold14>
                      <SimpleContainer
                        className={`lw-adminSupport__badge lw-adminSupport__badge--${statusClass(ticket.status)}`}
                      >
                        <Text12>{statusLabel(ticket.status)}</Text12>
                      </SimpleContainer>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SimpleCard>

          <SimpleCard className="lw-adminSupport__card lw-adminSupport__detailCard">
            {!detail ? (
              <Text14 className="lw-adminSupport__empty">{t('support.selectTicket')}</Text14>
            ) : (
              <>
                <SimpleContainer className="lw-adminSupport__detailHeader">
                  <TextBold24>{detail.ticket.title}</TextBold24>
                  <SimpleContainer
                    className={`lw-adminSupport__badge lw-adminSupport__badge--${statusClass(detail.ticket.status)}`}
                  >
                    <Text12>{statusLabel(detail.ticket.status)}</Text12>
                  </SimpleContainer>
                </SimpleContainer>
                <Text14 className="lw-adminSupport__description">{detail.ticket.description}</Text14>

                {(detail.events || []).length > 0 && (
                  <ul className="lw-adminSupport__timeline">
                    {(detail.events || []).map((ev) => (
                      <li key={ev.id}>
                        <Text14>{ev.body || ev.type}</Text14>
                      </li>
                    ))}
                  </ul>
                )}

                {(detail.comments || []).map((c) => (
                  <SimpleContainer key={c.id} className="lw-adminSupport__comment">
                    <Text12 className="lw-adminSupport__commentAuthor">{c.author?.name}</Text12>
                    <Text14>{c.body}</Text14>
                  </SimpleContainer>
                ))}

                <form className="lw-adminSupport__commentForm" onSubmit={onComment}>
                  <SimpleTextArea
                    className="lw-adminSupport__textarea"
                    title={t('support.commentLabel')}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <SecondaryButton type="submit" disabled={busy || !comment.trim()}>
                    {t('support.commentSubmit')}
                  </SecondaryButton>
                </form>
              </>
            )}
          </SimpleCard>
        </SimpleContainer>
      </SimpleScrollView>
    </SimpleScreen>
  );
}
