export async function uploadCurrentSigningFile({ file, fileKey, currentFile, uploadFile, onFileKey }) {
    const assertCurrent = () => {
        if (!file || currentFile() !== file) {
            const error = new Error('Signing input changed');
            error.code = 'STALE_SIGNING_INPUT';
            throw error;
        }
    };
    assertCurrent();
    if (fileKey) return fileKey;
    const result = await uploadFile(file);
    assertCurrent();
    const key = result?.key ?? result?.data?.key;
    if (!key) throw new Error('Missing uploaded file key');
    onFileKey(key);
    return key;
}
