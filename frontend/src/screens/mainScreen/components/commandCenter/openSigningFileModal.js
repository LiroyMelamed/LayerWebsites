import signingFilesApi from "../../../../api/signingFilesApi";
import ApiUtils from "../../../../api/apiUtils";
import { toastError, toastSuccess } from "../../../../components/ui/toast";
import { toastFromApiError } from "../../../../components/ui/showAppToast";
import { resolveShowPopup } from "../../../../utils/popupStackUtils";
import { SigningManagerFileDetails } from "../../../signingScreen/SigningManagerScreen";
function formatDotDate(dateLike) {
    if (!dateLike) return "-";
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "-";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
}

async function openPdfInNewTab(signingFileId) {
    const baseUrl = ApiUtils?.defaults?.baseURL || "";
    const token = localStorage.getItem("token");
    const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/pdf`;
    const res = await fetch(url, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function parseFilenameFromContentDisposition(headerValue) {
    const v = String(headerValue || "");
    const m = v.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const raw = decodeURIComponent((m?.[1] || m?.[2] || "").trim());
    return raw ? raw.replace(/[\\/\r\n\t]/g, "_") : null;
}

function downloadBlobAsFile(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function downloadEvidenceAsset(file, suffix) {
    const signingFileId = file?.SigningFileId;
    if (!signingFileId) throw new Error("missing id");
    const baseUrl = ApiUtils?.defaults?.baseURL || "";
    const token = localStorage.getItem("token");
    const path = suffix === "zip" ? "evidence-package" : "evidence-certificate";
    const res = await fetch(`${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/${path}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const disposition = res.headers.get("content-disposition");
    const ext = suffix === "zip" ? "zip" : "pdf";
    const filename =
        parseFilenameFromContentDisposition(disposition)
        || `evidence_${file?.CaseId || "noCase"}_${signingFileId}.${ext}`;
    downloadBlobAsFile(await res.blob(), filename);
}

/**
 * Open signing file details without leaving the current page.
 */
export async function openSigningFileModal({
    signingFileId,
    openPopup,
    pushPopup,
    closePopup,
    onChanged,
}) {
    const showPopup = resolveShowPopup({ pushPopup, openPopup });
    if (!signingFileId || !showPopup) return false;

    try {
        const res = await signingFilesApi.getSigningFileDetails(signingFileId);
        const file = res?.data?.file || res?.data;
        if (res?.status !== 200 || !file?.SigningFileId) {
            throw new Error("Signing file not found");
        }

        let isDeleting = false;

        showPopup(
            <SigningManagerFileDetails
                file={file}
                onClose={closePopup}
                onOpenPdf={async () => {
                    try {
                        await openPdfInNewTab(file.SigningFileId);
                    } catch (err) {
                        toastError("לא ניתן לפתוח את המסמך");
                    }
                }}
                onDownloadSigned={async () => {
                    try {
                        const response = await signingFilesApi.downloadSignedFile(file.SigningFileId);
                        const url = response?.data?.downloadUrl;
                        if (!url) throw new Error("missing url");
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.FileName || "signed_file.pdf";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    } catch (err) {
                        toastFromApiError(err, "שגיאה בהורדה");
                    }
                }}
                onDownloadEvidencePdf={async () => {
                    try {
                        await downloadEvidenceAsset(file, "pdf");
                    } catch {
                        toastError("שגיאה בהורדת תעודת הוכחה");
                    }
                }}
                onDownloadEvidenceZip={async () => {
                    try {
                        await downloadEvidenceAsset(file, "zip");
                    } catch {
                        toastError("שגיאה בהורדת חבילת הוכחה");
                    }
                }}
                onDelete={async (id) => {
                    if (isDeleting) return;
                    isDeleting = true;
                    try {
                        await signingFilesApi.deleteSigningFile(id);
                        toastSuccess("המסמך נמחק");
                        closePopup();
                        onChanged?.();
                    } catch (err) {
                        toastFromApiError(err, "שגיאה במחיקה");
                    } finally {
                        isDeleting = false;
                    }
                }}
                isDeleting={isDeleting}
                formatDotDate={formatDotDate}
                onRenamed={() => {
                    closePopup?.();
                    onChanged?.();
                }}
            />,
        );
        return true;
    } catch (err) {
        toastFromApiError(err, "לא ניתן לפתוח את המסמך");
        return false;
    }
}
