// controllers/signingFileController.js
const pool = require("../config/db");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, BUCKET } = require("../utils/r2");
const sendAndStoreNotification = require("../utils/sendAndStoreNotification");
const { detectHebrewSignatureSpotsFromPdfBuffer, streamToBuffer } = require("../utils/signatureDetection");

exports.uploadFileForSigning = async (req, res) => {
    try {
        const {
            caseId,
            clientId,
            fileName,
            fileKey,
            signatureLocations,
            notes,
            expiresAt,
        } = req.body;

        const lawyerId = req.user.UserId;

        if (!caseId || !clientId || !fileName || !fileKey) {
            return res
                .status(400)
                .json({ message: "חסרים שדות חובה (תיק, לקוח, שם קובץ, fileKey)" });
        }

        const insertFile = await pool.query(
            `insert into signingfiles
             (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat)
             values ($1,$2,$3,$4,$5,$5,'pending',$6,$7)
             returning signingfileid as "SigningFileId"`,
            [caseId, lawyerId, clientId, fileName, fileKey, notes || null, expiresAt || null]
        );

        const signingFileId = insertFile.rows[0].SigningFileId;

        if (Array.isArray(signatureLocations)) {
            for (const spot of signatureLocations) {
                await pool.query(
                    `insert into signaturespots
                     (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        signingFileId,
                        spot.pageNum || 1,
                        spot.x ?? 50,
                        spot.y ?? 50,
                        spot.width ?? 150,
                        spot.height ?? 75,
                        spot.signerName || "חתימה",
                        spot.isRequired !== false,
                    ]
                );
            }
        }

        await sendAndStoreNotification(
            clientId,
            "קובץ חדש לחתימה",
            `יש לך קובץ חדש לחתימה: ${fileName}`,
            { signingFileId, type: "signing_pending" }
        );

        return res.json({
            success: true,
            signingFileId,
            message: "קובץ נשלח ללקוח לחתימה",
        });
    } catch (err) {
        console.error("uploadFileForSigning error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בהעלאת הקובץ לחתימה" });
    }
};

exports.getClientSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;

        const result = await pool.query(
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.clientid = $1
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc`,
            [clientId]
        );

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getClientSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של הלקוח" });
    }
};

exports.getLawyerSigningFiles = async (req, res) => {
    try {
        const lawyerId = req.user.UserId;

        const result = await pool.query(
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "ClientName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.clientid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.lawyerid = $1
             group by sf.signingfileid, sf.caseid, sf.filename,
                      sf.status, sf.createdat, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc`,
            [lawyerId]
        );

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getLawyerSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של העו\"ד" });
    }
};

exports.getPendingSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;

        const result = await pool.query(
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.clientid = $1
               and sf.status in ('pending','rejected')
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes,
                      c.casename, u.name
             order by sf.createdat desc`,
            [clientId]
        );

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getPendingSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת מסמכים ממתינים" });
    }
};

exports.getSigningFileDetails = async (req, res) => {
    try {
        const { signingFileId } = req.params;
        const userId = req.user.UserId;

        const fileResult = await pool.query(
            `select 
                signingfileid   as "SigningFileId",
                caseid          as "CaseId",
                lawyerid        as "LawyerId",
                clientid        as "ClientId",
                filename        as "FileName",
                filekey         as "FileKey",
                originalfilekey as "OriginalFileKey",
                status          as "Status",
                signedfilekey   as "SignedFileKey",
                signedat        as "SignedAt",
                createdat       as "CreatedAt",
                expiresat       as "ExpiresAt",
                rejectionreason as "RejectionReason",
                notes           as "Notes"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== userId && file.ClientId !== userId) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        const spotsResult = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                pagenumber      as "PageNumber",
                x               as "X",
                y               as "Y",
                width           as "Width",
                height          as "Height",
                signername      as "SignerName",
                isrequired      as "IsRequired",
                issigned        as "IsSigned",
                signaturedata   as "SignatureData",
                signedat        as "SignedAt",
                createdat       as "CreatedAt"
             from signaturespots
             where signingfileid = $1
             order by pagenumber, y, x`,
            [signingFileId]
        );

        return res.json({
            file,
            signatureSpots: spotsResult.rows,
        });
    } catch (err) {
        console.error("getSigningFileDetails error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת פרטי המסמך" });
    }
};

exports.signFile = async (req, res) => {
    try {
        const { signingFileId } = req.params;
        const { signatureSpotId, signatureImage } = req.body;
        const clientId = req.user.UserId;

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                caseid        as "CaseId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                filekey       as "FileKey",
                status        as "Status",
                signedfilekey as "SignedFileKey",
                signedat      as "SignedAt"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.ClientId !== clientId) {
            return res.status(403).json({ message: "אין הרשאה לחתום על מסמך זה" });
        }

        const spotResult = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                issigned        as "IsSigned"
             from signaturespots
             where signaturespotid = $1 and signingfileid = $2`,
            [signatureSpotId, signingFileId]
        );

        if (spotResult.rows.length === 0) {
            return res.status(400).json({ message: "מקום חתימה לא תקין" });
        }

        const spot = spotResult.rows[0];
        if (spot.IsSigned) {
            return res.status(400).json({ message: "מקום החתימה כבר חתום" });
        }

        if (signatureImage) {
            const isPng = signatureImage.includes("png");
            const ext = isPng ? "png" : "jpg";
            const key = `signatures/${file.LawyerId}/${clientId}/${signingFileId}_${signatureSpotId}.${ext}`;

            const base64 = signatureImage.split(",")[1] || signatureImage;
            const buffer = Buffer.from(base64, "base64");

            const cmd = new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: `image/${ext}`,
            });

            await r2.send(cmd);

            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now(),
                     signaturedata = $1
                 where signaturespotid = $2`,
                [key, signatureSpotId]
            );
        } else {
            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now()
                 where signaturespotid = $1`,
                [signatureSpotId]
            );
        }

        const remainingResult = await pool.query(
            `select count(*)::int as "count"
             from signaturespots
             where signingfileid = $1
               and isrequired = true
               and issigned = false`,
            [signingFileId]
        );

        const remaining = remainingResult.rows[0].count;

        if (remaining === 0) {
            await pool.query(
                `update signingfiles
                 set status = 'signed',
                     signedat = now()
                 where signingfileid = $1`,
                [signingFileId]
            );

            await sendAndStoreNotification(
                file.LawyerId,
                "קובץ חתום",
                `הלקוח חתם על ${file.FileName}`,
                { signingFileId, type: "file_signed" }
            );
        }

        return res.json({ success: true, message: "החתימה נשמרה בהצלחה" });
    } catch (err) {
        console.error("signFile error:", err);
        return res.status(500).json({ message: "שגיאה בשמירת החתימה" });
    }
};

exports.rejectSigning = async (req, res) => {
    try {
        const { signingFileId } = req.params;
        const { rejectionReason } = req.body;
        const clientId = req.user.UserId;

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                clientid      as "ClientId",
                lawyerid      as "LawyerId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.ClientId !== clientId) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        await pool.query(
            `update signaturespots
             set issigned = false,
                 signedat = null,
                 signaturedata = null
             where signingfileid = $1`,
            [signingFileId]
        );

        await pool.query(
            `update signingfiles
             set status = 'rejected',
                 rejectionreason = $1
             where signingfileid = $2`,
            [rejectionReason || null, signingFileId]
        );

        await sendAndStoreNotification(
            file.LawyerId,
            "קובץ נדחה",
            `${file.FileName} נדחה על ידי הלקוח. סיבה: ${rejectionReason || "לא צוינה"}`,
            { signingFileId, type: "file_rejected" }
        );

        return res.json({ success: true, message: "המסמך נדחה" });
    } catch (err) {
        console.error("rejectSigning error:", err);
        return res.status(500).json({ message: "שגיאה בדחיית המסמך" });
    }
};

exports.reuploadFile = async (req, res) => {
    try {
        const { signingFileId } = req.params;
        const { fileKey, signatureLocations } = req.body;
        const lawyerId = req.user.UserId;

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== lawyerId) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        await pool.query(
            `update signingfiles
             set filekey = $1,
                 originalfilekey = $1,
                 status = 'pending',
                 rejectionreason = null,
                 signedfilekey = null,
                 signedat = null
             where signingfileid = $2`,
            [fileKey, signingFileId]
        );

        await pool.query(
            `delete from signaturespots
             where signingfileid = $1`,
            [signingFileId]
        );

        if (Array.isArray(signatureLocations)) {
            for (const spot of signatureLocations) {
                await pool.query(
                    `insert into signaturespots
                     (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        signingFileId,
                        spot.pageNum || 1,
                        spot.x ?? 50,
                        spot.y ?? 50,
                        spot.width ?? 150,
                        spot.height ?? 75,
                        spot.signerName || "חתימה",
                        spot.isRequired !== false,
                    ]
                );
            }
        }

        await sendAndStoreNotification(
            file.ClientId,
            "קובץ חדש לחתימה",
            `הקובץ ${file.FileName} הועלה מחדש לחתימה`,
            { signingFileId, type: "file_reuploaded" }
        );

        return res.json({ success: true, message: "הקובץ הועלה מחדש לחתימה" });
    } catch (err) {
        console.error("reuploadFile error:", err);
        return res.status(500).json({ message: "שגיאה בהעלאת קובץ מחדש" });
    }
};

exports.getSignedFileDownload = async (req, res) => {
    try {
        const { signingFileId } = req.params;
        const userId = req.user.UserId;

        const fileResult = await pool.query(
            `select 
                signingfileid  as "SigningFileId",
                lawyerid       as "LawyerId",
                clientid       as "ClientId",
                filename       as "FileName",
                status         as "Status",
                signedfilekey  as "SignedFileKey",
                filekey        as "FileKey"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== userId && file.ClientId !== userId) {
            return res.status(403).json({ message: "אין הרשאה להוריד מסמך זה" });
        }

        if (file.Status !== "signed" && !file.SignedFileKey) {
            return res.status(400).json({ message: "המסמך עדיין לא חתום" });
        }

        const key = file.SignedFileKey || file.FileKey;

        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${file.FileName}"`,
        });

        const downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });

        return res.json({ downloadUrl, expiresIn: 600 });
    } catch (err) {
        console.error("getSignedFileDownload error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור הורדה" });
    }
};

exports.detectSignatureSpots = async (req, res) => {
    try {
        const { fileKey } = req.body;
        if (!fileKey) return res.status(400).json({ message: "missing fileKey" });

        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
        const obj = await r2.send(cmd);
        const buffer = await streamToBuffer(obj.Body);

        const spots = await detectHebrewSignatureSpotsFromPdfBuffer(buffer);

        return res.json({ spots });
    } catch (err) {
        console.error("detectSignatureSpots error:", err);
        return res.status(500).json({ message: "failed to detect signature spots" });
    }
};
