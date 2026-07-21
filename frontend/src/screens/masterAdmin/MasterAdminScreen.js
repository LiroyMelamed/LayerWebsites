import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import ApiUtils from "../../api/apiUtils";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../../navigation/screenPaths";
import "./MasterAdminScreen.scss";

/**
 * מאסטר־אדמין ברמת פרויקט ל־LayerWebsites.
 */
export default function MasterAdminScreen() {
    const [searchParams] = useSearchParams();
    const centralTheme = searchParams.get("centralTheme") || "layerwebsites";
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const isPlatformAdmin =
        typeof window !== "undefined" && localStorage.getItem("isPlatformAdmin") === "true";

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        document.documentElement.setAttribute("data-central-theme", centralTheme);
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "he");
        return () => {
            document.documentElement.removeAttribute("data-central-theme");
        };
    }, [centralTheme]);

    useEffect(() => {
        if (!token || !isPlatformAdmin) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await ApiUtils.get("/admin/master-stats");
                if (!cancelled) {
                    setData(res.data);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    const msg = err?.response?.data?.message || err.message || "טעינה נכשלה";
                    const quota = /quota|compute/i.test(String(msg));
                    setError(
                        quota
                            ? "מכסת Neon חרגה — מוצג במצב מוחלש. שדרג את Neon או השתמש במסד מקומי."
                            : msg,
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, isPlatformAdmin]);

    if (!token) {
        return <Navigate to={LoginStackName + LoginScreenName} replace />;
    }

    if (!isPlatformAdmin) {
        return (
            <div className="lw-master" dir="rtl" lang="he">
                <div className="lw-master__card">
                    <h1>403 — מאסטר־אדמין</h1>
                    <p>נדרש חשבון מנהל פלטפורמה. התחבר עם משתמש platform-admin.</p>
                    <Link to="/AdminStack/MainScreen">חזרה לאדמין</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="lw-master" data-theme={centralTheme} dir="rtl" lang="he">
            <header className="lw-master__header">
                <div>
                    <p className="lw-master__eyebrow">LayerWebsites · מאסטר־אדמין פרויקט</p>
                    <h1>{data?.firm?.name || "משרד עורכי דין"}</h1>
                    <p className="lw-master__slug" dir="ltr">
                        {data?.firm?.slug || "—"}
                    </p>
                </div>
                <div className="lw-master__actions">
                    <Link to="/AdminStack/PlatformSettingsScreen" className="lw-master__btn">
                        הגדרות פלטפורמה
                    </Link>
                    <Link to="/AdminStack/MainScreen" className="lw-master__btn lw-master__btn--ghost">
                        לוח בקרה של המשרד
                    </Link>
                </div>
            </header>

            {loading ? <p className="lw-master__muted">טוען…</p> : null}
            {error ? <p className="lw-master__error">{error}</p> : null}

            {data?.stats ? (
                <div className="lw-master__stats">
                    <Stat label="לקוחות" value={data.stats.customers} />
                    <Stat label="תיקים פתוחים" value={data.stats.openCases} />
                    <Stat label="סה״כ תיקים" value={data.stats.totalCases} />
                    <Stat label="משתמשי צוות" value={data.stats.staffUsers} />
                </div>
            ) : null}

            <section className="lw-master__card">
                <h2>דיירים</h2>
                <p className="lw-master__muted">
                    הארכיטקטורה היא מסד נתונים אחד לכל משרד. מופע זה הוא הדייר היחיד לפריסה
                    הנוכחית.
                </p>
                <table className="lw-master__table">
                    <thead>
                        <tr>
                            <th>שם</th>
                            <th>סלאג</th>
                            <th>לקוחות</th>
                            <th>תיקים פתוחים</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{data?.firm?.name || "—"}</td>
                            <td>
                                <code dir="ltr">{data?.firm?.slug || "—"}</code>
                            </td>
                            <td>{data?.stats?.customers ?? "—"}</td>
                            <td>{data?.stats?.openCases ?? "—"}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="lw-master__stat">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
