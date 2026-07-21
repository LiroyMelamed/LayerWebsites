import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../../../navigation/screenPaths";
import "./ClientTicketScreen.scss";

const CENTRAL = (
  process.env.REACT_APP_CENTRAL_API_URL ||
  "https://central-api.mela-media.co.il"
).replace(/\/$/, "");

export default function ClientTicketScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const clientId = useMemo(() => {
    try {
      return localStorage.getItem("userId") || localStorage.getItem("userid") || "";
    } catch {
      return "";
    }
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`${CENTRAL}/api/v1/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          projectId: "layerwebsites",
          source: "client_portal",
          metadata: {
            source: "client_portal",
            clientId: clientId || undefined,
            appVersion: process.env.REACT_APP_VERSION || "web-1.0.0",
            path: typeof window !== "undefined" ? window.location.pathname : "/ticket",
            errorDetails: errorDetails || undefined,
            firm: process.env.REACT_APP_FIRM_NAME || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `שגיאה ${res.status}`);
      }
      setDone(data.message || "הפנייה התקבלה בהצלחה ותטופל בהקדם");
      setTitle("");
      setDescription("");
      setErrorDetails("");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="client-ticket" dir="rtl" lang="he">
      <div className="client-ticket__card">
        <p className="client-ticket__eyebrow">LayerWebsites · תמיכה</p>
        <h1>פתיחת פנייה</h1>
        <p className="client-ticket__muted">
          דווח על תקלה באזור האישי. הפנייה תגיע לצוות ותטופל בהקדם.
        </p>

        {done ? (
          <div className="client-ticket__ok" role="status">
            {done}
          </div>
        ) : null}
        {error ? (
          <div className="client-ticket__err" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="client-ticket__form">
          <label>
            <span>כותרת</span>
            <input
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: לא מצליח לפתוח מסמך"
            />
          </label>
          <label>
            <span>תיאור</span>
            <textarea
              required
              minLength={3}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="מה קרה? באיזה מסך?"
            />
          </label>
          <label>
            <span>פרטי שגיאה (אופציונלי)</span>
            <textarea
              rows={3}
              value={errorDetails}
              onChange={(e) => setErrorDetails(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "שולח…" : "שליחת פנייה"}
          </button>
        </form>

        <Link to={ClientStackName + ClientMainScreenName} className="client-ticket__back">
          → חזרה לאזור האישי
        </Link>
      </div>
    </div>
  );
}
