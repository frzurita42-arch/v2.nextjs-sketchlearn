'use client';
/* Shared 🎤 dictation (ElevenLabs speech-to-text). Records a short clip, transcribes
 * it server-side (/api/ai/stt) so the key never reaches the browser, and hands the
 * text to `onText`. `voiceOn` is true only when voice (ELEVENLABS_API_KEY) is
 * configured, so callers can hide the mic. Used by the coach chat and the repo /
 * presentation "create" composers. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';

export function useDictation(onText: (text: string) => void, onError?: (msg: string) => void) {
  const [voiceOn, setVoiceOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Is voice (ElevenLabs) configured? Controls whether the mic is shown.
  useEffect(() => { API.get('/api/config').then((c: any) => setVoiceOn(!!c?.voiceEnabled)).catch(() => { /* leave off */ }); }, []);
  // Stop any live mic track if the host unmounts mid-recording.
  useEffect(() => () => { try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ } }, []);

  const stopStream = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  const fail = (m: string) => { if (onError) onError(m); };

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.onerror = rej; rd.readAsDataURL(blob); });
      const r: any = await API.post('/api/ai/stt', { audio: dataUrl });
      if (r?.text) onText(r.text);
      else if (r?.error) fail(r.error);
    } catch (e: any) { fail(e.message); }
    setTranscribing(false);
  };

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { fail('This browser cannot record audio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const MR: any = (window as any).MediaRecorder;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MR?.isTypeSupported?.(t)) || '';
      const rec: MediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { stopStream(); const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }); if (blob.size) transcribe(blob); };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) { fail(`Microphone unavailable: ${e.message}`); stopStream(); }
  };

  const toggleMic = () => {
    if (recording) { setRecording(false); try { recRef.current?.stop(); } catch { /* noop */ } }
    else startRec();
  };

  return { voiceOn, recording, transcribing, toggleMic };
}
