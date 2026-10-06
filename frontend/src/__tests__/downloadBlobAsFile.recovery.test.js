import { downloadBlobAsFile } from '../utils/downloadBlobAsFile';

afterEach(() => { delete window.ReactNativeWebView; jest.restoreAllMocks(); jest.useRealTimers(); });

test('native ZIP and PDF exports preserve every byte and the requested filename', async () => {
    const postMessage = jest.fn();
    window.ReactNativeWebView = { postMessage };
    for (const [name, type] of [['evidence.zip', 'application/zip'], ['evidence.pdf', 'application/pdf']]) {
        const bytes = new Uint8Array([0, 80, 75, 128, 255, 10]);
        await downloadBlobAsFile(new Blob([bytes], { type }), name);
        const message = JSON.parse(postMessage.mock.calls.at(-1)[0]);
        expect(message.type).toBe('DOWNLOAD_BASE64');
        expect(message.payload).toMatchObject({ fileName: name, mimeType: type });
        expect(Array.from(atob(message.payload.base64), c => c.charCodeAt(0))).toEqual(Array.from(bytes));
    }
});

test('native file conversion failures reject so the screen can show an error', async () => {
    window.ReactNativeWebView = { postMessage: jest.fn() };
    jest.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () { this.onerror(); });
    await expect(downloadBlobAsFile(new Blob(['payload']), 'evidence.zip')).rejects.toThrow('File could not be read');
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
});

test('browser starts an attached download and keeps its URL alive long enough to consume', async () => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => 'blob:synthetic-qa');
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        expect(this.isConnected).toBe(true);
        expect(this.download).toBe('evidence_qa.zip');
        expect(this.href).toBe('blob:synthetic-qa');
    });
    await downloadBlobAsFile(new Blob(['zip']), 'evidence/qa.zip');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-qa');
});
