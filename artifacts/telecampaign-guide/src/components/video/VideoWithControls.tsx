import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  login: { title: 'Đăng nhập an toàn', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  connect: { title: 'Kết nối Telegram', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  sync: { title: 'Đồng bộ nhóm & Topics', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  template: { title: 'Tạo mẫu tin nhắn', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  campaign: { title: 'Thiết lập campaign', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
  monitor: { title: 'Theo dõi tiến độ', filePath: 'src/components/video/video_scenes/Scene6.tsx' },
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PreviewControls() {
  const isIframed = window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(performance.now());

  useEffect(() => {
    startedAt.current = performance.now();
    setElapsed(0);
    const interval = window.setInterval(() => setElapsed(performance.now() - startedAt.current), 60);
    return () => window.clearInterval(interval);
  }, [controls.tick]);

  const jumpTo = useCallback((index: number) => {
    controls.jumpTo(index);
    const key = controls.sceneKeys[index];
    const details = SCENE_DETAILS[key];
    if (details) {
      window.parent.postMessage({
        type: 'REPLIT_VIDEO_SCENE_SELECTED',
        payload: { sceneIndex: index, sceneCount: controls.sceneKeys.length, sceneTitle: details.title, filePath: details.filePath, lineNumber: 1 },
      }, '*');
    }
  }, [controls]);

  if (!isIframed) return <VideoTemplate />;

  const visible = !collapsed || hovering;
  const progress = controls.activeDuration ? Math.min(1, elapsed / controls.activeDuration) : 0;
  const totalElapsed = Math.min(controls.totalDuration, controls.activeStartTime + Math.min(elapsed, controls.activeDuration));

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <VideoTemplate key={controls.mountKey} durations={controls.durations} loop muted={muted} onSceneChange={controls.onSceneChange} />
      <div
        className="absolute inset-x-0 bottom-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setHovering(false)}
      >
        <div className={`flex items-center gap-3 bg-slate-950/75 px-5 py-3.5 backdrop-blur-md transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <button type="button" onClick={controls.toggleLock} aria-pressed={controls.locked} aria-label="Lặp cảnh hiện tại" className={`grid h-11 w-11 place-items-center rounded-lg transition ${controls.locked ? 'bg-white/20 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><Repeat className="h-5 w-5" /></button>
          <button type="button" onClick={() => setMuted((value) => !value)} aria-pressed={muted} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'} className="grid h-11 w-11 place-items-center rounded-lg text-white/65 transition hover:bg-white/10 hover:text-white">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
          <div className="h-8 w-px bg-white/15" />
          <div className="flex flex-1 gap-1.5">
            {controls.sceneKeys.map((key, index) => (
              <button key={key} type="button" onClick={() => jumpTo(index)} aria-label={`Chuyển đến cảnh ${index + 1}: ${SCENE_DETAILS[key].title}`} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/20 transition hover:h-3.5">
                <span className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-75" style={{ width: `${index === controls.activeIndex ? progress * 100 : 0}%` }} />
              </button>
            ))}
          </div>
          <span className="font-mono text-xs text-white/70">{controls.activeIndex + 1}/{controls.sceneKeys.length}</span>
          <span className="min-w-[10ch] text-right font-mono text-xs text-white/80">{formatTime(totalElapsed)} / {formatTime(controls.totalDuration)}</span>
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Hiện điều khiển' : 'Ẩn điều khiển'} className="grid h-11 w-11 place-items-center rounded-lg text-white/65 transition hover:bg-white/10 hover:text-white">{collapsed ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}</button>
        </div>
      </div>
    </div>
  );
}

export default function VideoWithControls() {
  return <PreviewControls />;
}