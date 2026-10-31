// Spoken parts' audio (D24, 0.14.0): a page's clips, polled while any is
// still being made, and the player row a spoken part shows for each clip. One
// clip plays at a time on the page. The MP3 comes through the worker, which
// holds the sign-in, as base64, and plays from an object URL.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Clip } from '@vocabularium/contracts';
import { t } from './i18n.ts';

// A line over this is not spoken (K73).
export const MAX_SPOKEN_LENGTH = 500;
const POLL_MS = 1000;

type ClipKey = Readonly<{ componentId: string; part: string; line: number }>;
const idOf = (key: ClipKey) => `${key.componentId}/${key.part}/${key.line}`;
type Playback = Readonly<{ id: string; progress: number; playing: boolean }>;
type Clips = Readonly<{
  clip: (key: ClipKey) => Clip | undefined;
  playback: Playback | null;
  toggle: (key: ClipKey) => void;
  retry: (key: ClipKey) => void;
}>;
const ClipsContext = createContext<Clips | null>(null);

async function send<T>(message: Record<string, unknown>): Promise<T> {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw Object.assign(new Error(result.error), { code: result.code });
  return result as T;
}

// The page's clips. `version` changes whenever the page's components do, such
// as a card finishing, so the list is read again then; while a clip is waiting
// or generating it is read every second.
export function ClipsProvider({ pageId, version, children }: { pageId: string; version: string; children: ReactNode }) {
  const [clips, setClips] = useState<readonly Clip[]>([]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    void send<{ clips: Clip[] }>({ type: 'page-audio', pageId }).then(result => { if (live) setClips(result.clips); }, () => {});
    return () => { live = false; };
  }, [pageId, version, tick]);
  const pending = clips.some(clip => clip.state === 'waiting' || clip.state === 'generating');
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTick(value => value + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, clips]);

  // A clip spoken again has new audio: its cached URL goes once it is no longer ready.
  useEffect(() => {
    for (const [id, url] of urls.current) {
      const clip = clips.find(each => idOf(each) === id);
      if (clip?.state !== 'ready') { URL.revokeObjectURL(url); urls.current.delete(id); }
    }
  }, [clips]);
  useEffect(() => () => {
    audio.current?.pause();
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
  }, [pageId]);

  const stop = useCallback(() => { audio.current?.pause(); setPlayback(null); }, []);
  const toggle = useCallback((key: ClipKey) => {
    const id = idOf(key);
    if (playback?.id === id && playback.playing) { stop(); return; }
    audio.current?.pause();
    setPlayback({ id, progress: 0, playing: true });
    void (async () => {
      let url = urls.current.get(id);
      if (!url) {
        const { mime, data } = await send<{ mime: string; data: string }>({ type: 'clip-audio', pageId, ...key });
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        urls.current.set(id, url);
      }
      const player = new Audio(url);
      audio.current = player;
      player.ontimeupdate = () => setPlayback(current => current?.id === id && player.duration
        ? { id, playing: true, progress: Math.min(1, player.currentTime / player.duration) } : current);
      player.onended = () => setPlayback(current => current?.id === id ? null : current);
      await player.play();
    })().catch(() => setPlayback(current => current?.id === id ? null : current));
  }, [pageId, playback, stop]);
  const retry = useCallback((key: ClipKey) => {
    if (playback?.id === idOf(key)) stop();
    setClips(current => current.map(clip => idOf(clip) === idOf(key) ? { ...clip, state: 'waiting', errorCode: undefined } : clip));
    void send({ type: 'clip-retry', pageId, ...key }).finally(() => setTick(value => value + 1));
  }, [pageId, playback, stop]);

  const value = useMemo<Clips>(() => ({
    clip: key => clips.find(each => idOf(each) === idOf(key)), playback, toggle, retry
  }), [clips, playback, toggle, retry]);
  return <ClipsContext.Provider value={value}>{children}</ClipsContext.Provider>;
}

const minutes = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
// Why a clip failed, in the interface language.
const failure = (code?: string) => code === 'provider_unconfigured' ? t('audio.unconfigured')
  : code === 'generation_busy' ? t('audio.busy') : t('audio.failed');

const RetryIcon = () => <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
  strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;

// One spoken line's player row (direction A, owner 30 October 2026): a play
// button, a progress line and the duration; while the clip is being made, a
// waiting button and a moving line; a failed clip says why, with its Retry; a
// part that is not spoken says so, with the card's Retry beside it.
export function ClipPlayer({ componentId, part, line, text, speakable, tooLong, onRetryCard }: {
  componentId: string; part: string; line: number; text: string; speakable: boolean; tooLong?: boolean; onRetryCard?: () => void;
}) {
  const clips = useContext(ClipsContext);
  const key = { componentId, part, line };
  if (!speakable || tooLong) return <div className="clip-player" data-state="unspoken">
    <span className="clip-note">{tooLong ? t('audio.tooLong') : t('audio.notSpoken')}</span>
    {onRetryCard && <button type="button" className="clip-retry" onClick={onRetryCard}><RetryIcon />{t('common.retry')}</button>}
  </div>;
  const clip = clips?.clip(key);
  if (clip?.state === 'failed') return <div className="clip-player" data-state="failed" role="status">
    <svg className="clip-warning" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v5" /><path d="M12 16.5v.01" /><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
    <span className="clip-note">{failure(clip.errorCode)}</span>
    <button type="button" className="clip-retry" aria-label={t('audio.retryNamed', { text })} onClick={() => clips?.retry(key)}><RetryIcon />{t('common.retry')}</button>
  </div>;
  if (clip?.state !== 'ready') return <div className="clip-player" data-state="generating">
    <button type="button" className="clip-play" disabled aria-label={t('audio.generating')}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 4a8 8 0 0 1 8 8" /></svg>
    </button>
    <span className="clip-track"><span className="clip-fill" /></span>
    <span className="clip-time" aria-hidden="true">—</span>
    <span className="visually-hidden" role="status">{t('audio.generating')}</span>
  </div>;
  const playing = clips?.playback?.id === idOf(key) ? clips.playback : null;
  return <div className="clip-player" data-state={playing ? 'playing' : 'ready'}>
    <button type="button" className="clip-play" aria-label={t(playing ? 'audio.pause' : 'audio.play', { text })} aria-pressed={Boolean(playing)}
      onClick={() => clips?.toggle(key)}>
      {playing ? <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
    </button>
    <span className="clip-track"><span className="clip-fill" style={{ width: `${Math.round((playing?.progress ?? 0) * 100)}%` }} /></span>
    <span className="clip-time">{minutes(clip.durationMs ?? 0)}</span>
  </div>;
}
