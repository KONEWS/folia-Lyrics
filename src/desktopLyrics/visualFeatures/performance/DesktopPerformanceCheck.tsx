import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import { Button } from '../../../components/modal/settings/kit';
import { VisualCard } from '../../DesktopVisualControls';
import { initializeDesktopAnalysisModels } from '../beat/desktopAnalysisModels';

// Opens a local performance comparison over the existing desktop settings, using bundled models only.
const PerformanceScene = lazy(() => import('../../../components/perfCheck/PerfCheckApp'));

function PerformanceDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => element?.close();
    }, []);
    return createPortal(<dialog ref={dialog} className="desktop-visual-asset-dialog" data-folia-sheet aria-label={t('perfCheck.title')}
        style={{ position: 'fixed', inset: 0, margin: 0, width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', border: 0, padding: 0, background: '#000', color: '#fff' }}
        onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
        <Suspense fallback={<div className="fixed inset-0 bg-black p-6 text-white"><p role="status">{t('perfCheck.phaseWarmup')}</p><Button onClick={onClose}>{t('perfCheck.cancel')}</Button></div>}>
            <PerformanceScene onClose={onClose}/>
        </Suspense>
    </dialog>, document.body);
}

export default function DesktopPerformanceCheck({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const notify = useRef(onOpenChange);
    notify.current = onOpenChange;
    useEffect(() => {
        notify.current?.(open);
        return () => { if (open) notify.current?.(false); };
    }, [open]);
    return <VisualCard title={t('perfCheck.title')}>
        <p className="desktop-visual-hint">{t('perfCheck.offerDescription')}</p>
        <div><Button icon={Gauge} onClick={() => {
            void initializeDesktopAnalysisModels().catch(error => console.warn('[PerfCheck] Bundled models unavailable', error));
            setOpen(true);
        }}>{t('perfCheck.offerConfirm')}</Button></div>
        {open && <PerformanceDialog onClose={() => setOpen(false)}/>}
    </VisualCard>;
}
