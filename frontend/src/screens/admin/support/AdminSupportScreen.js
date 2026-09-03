import { useCallback, useEffect, useState } from 'react';
import {
  addSupportComment,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
} from '../../api/supportApi';
import { AdminStackName, MainScreenName } from '../../navigation/screenPaths';
import { useNavigate } from 'react-router-dom';
import './AdminSupportScreen.scss';

const STATUS_HE = {
  open: 'פתוח',
  in_progress: 'בתהליך',
  resolved: 'טופל',
  pr_created: 'טופל',
  closed: 'סגור',
};

export default function AdminSupportScreen() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createSupportTicket({ title, description });
      setTitle('');
      setDescription('');
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
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-support" dir="rtl" lang="he">
      <button type="button" className="admin-support__back" onClick={() => navigate(AdminStackName + MainScreenName)}>
        → חזרה
      </button>
      <header className="admin-support__header">
        <p className="admin-support__eyebrow">MelamedLaw · תמיכה</p>
        <h1>פניות תמיכה</h1>
        <p className="admin-support__muted">פתיחת פנייה ומעקב סטטוס מול צוות MelaMedia.</p>
      </header>

      {error ? <div className="admin-support__error">{error}</div> : null}

      <form className="admin-support__form" onSubmit={onCreate}>
        <h2>פתיחת פנייה חדשה</h2>
        <input required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת" />
        <textarea required minLength={3} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור" />
        <button type="submit" disabled={busy}>{busy ? 'שולח…' : 'שליחת פנייה'}</button>
      </form>

      <div className="admin-support__grid">
        <section>
          <h2>הפניות ({tickets.length})</h2>
          {tickets.length === 0 ? <p className="admin-support__muted">אין פניות.</p> : (
            <ul>
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" className={selectedId === t.id ? 'is-active' : ''} onClick={() => setSelectedId(t.id)}>
                    <strong>{t.title}</strong>
                    <span>{STATUS_HE[t.status] || t.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          {!detail ? <p className="admin-support__muted">בחרו פנייה מהרשימה.</p> : (
            <>
              <h2>{detail.ticket.title}</h2>
              <p className="admin-support__muted">{STATUS_HE[detail.ticket.status] || detail.ticket.status}</p>
              <p>{detail.ticket.description}</p>
              {(detail.events || []).length > 0 && (
                <ul className="admin-support__timeline">
                  {detail.events.map((ev) => (
                    <li key={ev.id}>{ev.body || ev.type}</li>
                  ))}
                </ul>
              )}
              {(detail.comments || []).map((c) => (
                <div key={c.id} className="admin-support__comment">
                  <small>{c.author?.name}</small>
                  <p>{c.body}</p>
                </div>
              ))}
              <form onSubmit={onComment}>
                <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="הערה…" />
                <button type="submit" disabled={busy || !comment.trim()}>שליחה</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
