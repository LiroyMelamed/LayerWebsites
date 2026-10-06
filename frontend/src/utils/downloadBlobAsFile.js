// Native WebViews cannot download browser blob URLs. Send the bytes through
// the existing file bridge; normal browsers keep the download anchor flow.
export async function downloadBlobAsFile(blob, filename = 'download') {
    const safeName = String(filename || 'download').replace(/[\\/\r\n\t]/g, '_');
    if (typeof window.ReactNativeWebView?.postMessage === 'function') {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('File could not be read'));
            reader.onabort = () => reject(new Error('File read was cancelled'));
            reader.onload = () => {
                const result = String(reader.result || '');
                const comma = result.indexOf(',');
                if (comma < 0 || comma === result.length - 1) {
                    reject(new Error('File contents are empty'));
                    return;
                }
                resolve(result.slice(comma + 1));
            };
            reader.readAsDataURL(blob);
        });
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DOWNLOAD_BASE64',
            payload: { base64, fileName: safeName, mimeType: blob.type || 'application/octet-stream' },
        }));
        return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    try { anchor.click(); }
    finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
}
