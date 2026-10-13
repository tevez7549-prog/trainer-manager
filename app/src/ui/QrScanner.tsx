import { createElement, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Btn, H, Txt } from './index';
import { Icon } from './Icon';
import { C, R } from '../lib/theme';
import { loadJsQR, readQrFromFile } from '../lib/qr';

/**
 * Full-screen camera that reads a QR code (web). Uses the back camera; Chrome reads with its built-in
 * BarcodeDetector, Safari with jsQR. `accept` decides whether a code is the right kind — anything else
 * shows a hint and keeps scanning. If the camera can't open (no permission, no camera on a PC),
 * a photo of the code can be picked instead.
 */
export function QrScanner<T>({ open, title, hint, accept, onResult, onClose }: {
  open: boolean; title: string; hint?: string;
  accept: (text: string) => T | null; onResult: (v: T) => void; onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    let stop = false, stream: MediaStream | null = null, timer: any = null;
    setErr(''); setWrong(false);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    const BD = (globalThis as any).BarcodeDetector;
    const detector = BD ? new BD({ formats: ['qr_code'] }) : null;

    const found = (text: string | null | undefined) => {
      if (!text) return false;
      const v = accept(text);
      if (v === null) { setWrong(true); return false; }
      stop = true; onResult(v); return true;
    };
    const tick = async () => {
      if (stop) return;
      const el = video.current;
      if (el && el.readyState >= 2 && el.videoWidth) {
        try {
          if (detector) {
            const r = await detector.detect(el);
            if (found(r?.[0]?.rawValue)) return;
          } else {
            const jsQR = await loadJsQR();
            const s = Math.min(1, 640 / el.videoWidth);
            canvas.width = Math.round(el.videoWidth * s); canvas.height = Math.round(el.videoHeight * s);
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (found(jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })?.data)) return;
          }
        } catch { /* a bad frame; try the next */ }
      }
      timer = setTimeout(tick, 180);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current;
        if (el) { el.srcObject = stream; await el.play().catch(() => {}); }
        if (!detector) loadJsQR().catch(() => {});
        tick();
      } catch {
        setErr('เปิดกล้องไม่ได้ · กดอนุญาตให้ใช้กล้อง หรือถ่ายรูป QR แทน');
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [open]);

  function pickPhoto() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const text = await readQrFromFile(f);
        const v = text ? accept(text) : null;
        if (v !== null) onResult(v);
        else setErr(text ? 'QR นี้ไม่ใช่ UID ของแอป' : 'ไม่พบ QR ในรูป · ลองถ่ายให้ชัดและใกล้ขึ้น');
      } finally { setBusy(false); }
    };
    input.click();
  }

  if (Platform.OS !== 'web') return null;
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 420, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <H size={20} style={{ flex: 1, color: '#fff' }}>{title}</H>
            <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={onClose}
              style={{ width: 44, height: 44, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Icon name="x" size={20} color="#fff" />
            </Pressable>
          </View>
          <View style={{ width: '100%', aspectRatio: 1, borderRadius: R.card, overflow: 'hidden', backgroundColor: '#000', borderWidth: 2, borderColor: C.brand }}>
            {createElement('video', { ref: video, playsInline: true, muted: true, autoPlay: true,
              style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } })}
          </View>
          <Txt style={{ color: '#fff', textAlign: 'center' }}>{hint ?? 'ส่องกล้องไปที่ QR'}</Txt>
          {wrong && !err ? <Txt size={13.5} style={{ color: C.brand, textAlign: 'center' }}>QR นี้ไม่ใช่ UID ของแอป · ให้เปิดหน้า "ฉัน" ของอีกฝ่าย</Txt> : null}
          {err ? <Txt size={13.5} style={{ color: '#FFB4A8', textAlign: 'center' }}>{err}</Txt> : null}
          <Btn kind="ghost" icon="camera" label="ถ่ายรูป / เลือกรูป QR แทน" onPress={pickPhoto} loading={busy} textColor="#fff" />
        </View>
      </View>
    </Modal>
  );
}
