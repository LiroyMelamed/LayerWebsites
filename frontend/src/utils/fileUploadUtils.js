// frontend/src/utils/fileUploadUtils.js
import filesApi from "../api/filesApi";

// Prefer server-side upload (avoids browser→R2 CORS on new buckets).
// Fall back to presigned PUT when the direct endpoint is unavailable.

export const uploadFileToR2 = async (file) => {
    try {
        if (!file) {
            return { success: false, data: null, message: "missing file" };
        }

        const fileName = file.name || "file";
        const parts = fileName.split(".");
        const ext = (parts.length > 1 ? parts[parts.length - 1] : "pdf").toLowerCase();
        const mime = file.type || "application/octet-stream";

        // 1) Direct API upload
        try {
            const direct = await filesApi.uploadFile(file);
            const key = direct?.data?.key;
            if (direct?.success && key) {
                return {
                    success: true,
                    data: {
                        key,
                        fileName: direct?.data?.fileName || fileName,
                        ext: direct?.data?.ext || ext,
                        mime: direct?.data?.mime || mime,
                        size: direct?.data?.size ?? file.size,
                    },
                };
            }
            // If the route exists but failed, surface that — don't hide behind CORS fallback noise.
            if (direct && direct.status && direct.status !== 404) {
                return {
                    success: false,
                    data: null,
                    message: direct?.data?.message || direct?.message || "upload failed",
                };
            }
        } catch (directErr) {
            console.warn("direct upload unavailable, trying presign:", directErr?.message || directErr);
        }

        // 2) Presigned PUT (needs R2 bucket CORS for the SPA origin)
        const presignResponse = await filesApi.presignUpload({ ext, mime });
        const uploadUrl = presignResponse?.data?.uploadUrl;
        const key = presignResponse?.data?.key;

        if (!presignResponse?.success || !uploadUrl || !key) {
            return {
                success: false,
                data: null,
                message: presignResponse?.data?.message || presignResponse?.message || "failed to get upload url",
            };
        }

        const putResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Type": mime,
            },
            body: file,
        });

        if (!putResponse.ok) {
            const errText = await putResponse.text().catch(() => "");
            return {
                success: false,
                data: null,
                message: `upload failed (${putResponse.status}) ${errText}`,
            };
        }

        return {
            success: true,
            data: {
                key,
                fileName,
                ext,
                mime,
                size: file.size,
            },
        };
    } catch (err) {
        console.error("uploadFileToR2 error:", err);
        return {
            success: false,
            data: null,
            message: err?.message || "upload failed",
        };
    }
};

export const getFileReadUrl = async (key) => {
    try {
        if (!key) {
            return { success: false, data: null, message: "missing key" };
        }

        const response = await filesApi.presignRead(key);
        const readUrl = response?.data?.readUrl;

        if (!response?.success || !readUrl) {
            return {
                success: false,
                data: null,
                message: response?.message || "failed to get read url",
            };
        }

        return { success: true, data: { readUrl, expiresIn: response?.data?.expiresIn } };
    } catch (err) {
        console.error("getFileReadUrl error:", err);
        return {
            success: false,
            data: null,
            message: err?.message || "failed to get read url",
        };
    }
};

export default {
    uploadFileToR2,
    getFileReadUrl,
};
