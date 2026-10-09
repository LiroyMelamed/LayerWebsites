import { personalStampPdf } from './personalStampPdf';

const file = { size: 120, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
afterEach(() => jest.restoreAllMocks());
test('a single stamp PDF renders a bounded PNG and closes the incumbent PDF.js task', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const page = { getViewport: ({ scale }) => ({ width: 600 * scale, height: 300 * scale }), render };
    const task = { promise: Promise.resolve({ numPages: 1, getPage: jest.fn(async () => page) }), destroy: jest.fn(async () => {}) };
    const pdfjs = { getDocument: jest.fn(() => task) };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,synthetic-png');
    expect(await personalStampPdf(file, pdfjs)).toBe('data:image/png;base64,synthetic-png');
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ data: new Uint8Array([1, 2, 3]), isEvalSupported: false });
    expect(render.mock.calls[0][0].viewport).toEqual({ width: 1200, height: 600 });
    expect(task.destroy).toHaveBeenCalledTimes(1);
});
test('a multipage stamp is refused without silently choosing a page, and cleans up', async () => {
    const getPage = jest.fn(), task = { promise: Promise.resolve({ numPages: 2, getPage }), destroy: jest.fn(async () => {}) };
    await expect(personalStampPdf(file, { getDocument: () => task })).rejects.toThrow('STAMP_PDF_ONE_PAGE');
    expect(getPage).not.toHaveBeenCalled(); expect(task.destroy).toHaveBeenCalledTimes(1);
});
test('oversized input and corrupt PDF do not reach signing or leak a PDF.js task', async () => {
    const getDocument = jest.fn();
    await expect(personalStampPdf({ size: 6 * 1024 * 1024 }, { getDocument })).rejects.toThrow('STAMP_PDF_TOO_LARGE');
    expect(getDocument).not.toHaveBeenCalled();
    const task = { promise: Promise.reject(new Error('Invalid PDF')), destroy: jest.fn(async () => {}) };
    await expect(personalStampPdf(file, { getDocument: () => task })).rejects.toThrow('Invalid PDF');
    expect(task.destroy).toHaveBeenCalledTimes(1);
});
