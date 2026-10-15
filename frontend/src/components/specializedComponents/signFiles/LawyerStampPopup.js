import React, { useRef, useState, useEffect, useCallback } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import PrimaryButton from '../../styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../styledComponents/buttons/SecondaryButton';
import FileUploadBox from '../../styledComponents/fileUpload/FileUploadBox';
import { TextBold24, Text14 } from '../text/AllTextKindFile';
import { useTranslation } from 'react-i18next';

import './LawyerStampPopup.scss';

export default function LawyerStampPopup({ onConfirm, onCancel }) {
    const { t } = useTranslation();
    const canvasRef = useRef(null);
    const stampImgRef = useRef(null);
    const [stampFile, setStampFile] = useState(null);
    const [stampUrl, setStampUrl] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const lastPointRef = useRef(null);

    // Convert uploaded file to data URL for preview
    useEffect(() => {
        if (!stampFile) { setStampUrl(null); return; }
        const url = URL.createObjectURL(stampFile);
        setStampUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [stampFile]);

    // Initialize canvas when stamp loads
    const handleStampLoad = useCallback(() => {
        const canvas = canvasRef.current;
        const img = stampImgRef.current;
        if (!canvas || !img) return;

        canvas.width = img.naturalWidth || img.width || 400;
        canvas.height = img.naturalHeight || img.height || 200;
    }, []);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY,
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        setIsDrawing(true);
        lastPointRef.current = getPos(e);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !lastPointRef.current) return;

        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastPointRef.current = pos;
        setHasDrawn(true);
    };

    const stopDraw = () => {
        setIsDrawing(false);
        lastPointRef.current = null;
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setHasDrawn(false);
    };

    const handleConfirm = () => {
        const canvas = canvasRef.current;
        const img = stampImgRef.current;
        if (!canvas || !img) return;

        // Compose the stamp image + hand signature into one image
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = canvas.width;
        compositeCanvas.height = canvas.height;
        const ctx = compositeCanvas.getContext('2d');

        // Draw the stamp image first
        ctx.drawImage(img, 0, 0, compositeCanvas.width, compositeCanvas.height);
        // Draw the hand signature on top
        ctx.drawImage(canvas, 0, 0);

        const dataUrl = compositeCanvas.toDataURL('image/png');
        onConfirm?.(dataUrl);
    };

    const handleFileSelected = (file) => {
        if (!file) return;
        setStampFile(file);
        clearCanvas();
    };

    const isPdf = stampFile?.type === 'application/pdf';

    return (
        <SimpleContainer className="lw-lawyerStampPopup">
            <TextBold24>{t('signing.fieldSettings.lawyerStampTitle')}</TextBold24>

            {!stampUrl && (
                <SimpleContainer className="lw-lawyerStampPopup__upload">
                    <Text14>{t('signing.fieldSettings.lawyerStampUploadHint')}</Text14>
                    <FileUploadBox
                        accept=".pdf,.png,.jpg,.jpeg"
                        onFileSelected={handleFileSelected}
                        label={t('signing.fieldSettings.lawyerStampUploadHint')}
                    />
                </SimpleContainer>
            )}

            {stampUrl && !isPdf && (
                <SimpleContainer className="lw-lawyerStampPopup__preview">
                    <Text14>{t('signing.fieldSettings.lawyerStampDrawHint')}</Text14>
                    <SimpleContainer className="lw-lawyerStampPopup__canvasWrap">
                        <img
                            ref={stampImgRef}
                            src={stampUrl}
                            alt="stamp"
                            className="lw-lawyerStampPopup__stampImg"
                            onLoad={handleStampLoad}
                            crossOrigin="anonymous"
                        />
                        <canvas
                            ref={canvasRef}
                            className="lw-lawyerStampPopup__canvas"
                            onMouseDown={startDraw}
                            onMouseMove={draw}
                            onMouseUp={stopDraw}
                            onMouseLeave={stopDraw}
                            onTouchStart={startDraw}
                            onTouchMove={draw}
                            onTouchEnd={stopDraw}
                        />
                    </SimpleContainer>
                    <SimpleContainer className="lw-lawyerStampPopup__actions">
                        <SecondaryButton onPress={clearCanvas}>
                            {t('signing.fieldSettings.lawyerStampClearDraw')}
                        </SecondaryButton>
                        <SecondaryButton onPress={() => { setStampFile(null); setStampUrl(null); clearCanvas(); }}>
                            {t('common.back')}
                        </SecondaryButton>
                    </SimpleContainer>
                </SimpleContainer>
            )}

            {stampUrl && isPdf && (
                <SimpleContainer className="lw-lawyerStampPopup__pdfNote">
                    <Text14>{t('signing.fieldSettings.lawyerStampDrawHint')}</Text14>
                    <SimpleContainer className="lw-lawyerStampPopup__canvasWrap lw-lawyerStampPopup__canvasWrap--pdf">
                        <object
                            data={stampUrl}
                            type="application/pdf"
                            className="lw-lawyerStampPopup__pdfEmbed"
                        >
                            <Text14>PDF stamp preview</Text14>
                        </object>
                        <canvas
                            ref={canvasRef}
                            className="lw-lawyerStampPopup__canvas"
                            width={400}
                            height={200}
                            onMouseDown={startDraw}
                            onMouseMove={draw}
                            onMouseUp={stopDraw}
                            onMouseLeave={stopDraw}
                            onTouchStart={startDraw}
                            onTouchMove={draw}
                            onTouchEnd={stopDraw}
                        />
                    </SimpleContainer>
                    <SimpleContainer className="lw-lawyerStampPopup__actions">
                        <SecondaryButton onPress={clearCanvas}>
                            {t('signing.fieldSettings.lawyerStampClearDraw')}
                        </SecondaryButton>
                        <SecondaryButton onPress={() => { setStampFile(null); setStampUrl(null); clearCanvas(); }}>
                            {t('common.back')}
                        </SecondaryButton>
                    </SimpleContainer>
                </SimpleContainer>
            )}

            <SimpleContainer className="lw-lawyerStampPopup__footer">
                <SecondaryButton onPress={onCancel}>{t('common.cancel')}</SecondaryButton>
                <PrimaryButton
                    onPress={handleConfirm}
                    disabled={!stampUrl || !hasDrawn}
                >
                    {t('signing.fieldSettings.lawyerStampConfirm')}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}
