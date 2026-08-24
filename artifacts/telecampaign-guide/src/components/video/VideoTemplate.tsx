import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS = {
  login: 15000,
  connect: 16000,
  sync: 15000,
  template: 18000,
  campaign: 20000,
  monitor: 16000,
};

const SCENE_COMPONENTS = {
  login: Scene1,
  connect: Scene2,
  sync: Scene3,
  template: Scene4,
  campaign: Scene5,
  monitor: Scene6,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let elapsed = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = elapsed / 1000;
    elapsed += duration;
  }
  return offsets;
})();

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_COMPONENTS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > 0.18) audio.currentTime = targetTime;
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="w-full h-screen overflow-hidden relative bg-bg-base font-body text-text-primary">
      {/* PERSISTENT BACKGROUND LAYER */}
      
      {/* Grid Pattern */}
      <motion.div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(var(--color-text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-text-primary) 1px, transparent 1px)',
          backgroundSize: '3vw 3vw',
        }}
        animate={{
          y: ['0vw', '-3vw'],
          x: ['0vw', '-3vw'],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
      />
      
      {/* Subtle Glow Orbs that move based on current scene */}
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full blur-[100px] pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle, var(--color-primary), transparent 70%)' }}
        animate={{
          left: ['10%', '60%', '20%', '70%', '10%', '50%'][sceneIndex],
          top: ['-10%', '20%', '50%', '-10%', '40%', '20%'][sceneIndex],
          scale: [1, 1.2, 0.8, 1.1, 0.9, 1.3][sceneIndex],
        }}
        transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
      />
      
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full blur-[80px] pointer-events-none opacity-10"
        style={{ background: 'radial-gradient(circle, var(--color-accent), transparent 70%)' }}
        animate={{
          right: ['-10%', '20%', '70%', '10%', '50%', '10%'][sceneIndex],
          bottom: ['-10%', '40%', '-10%', '50%', '10%', '30%'][sceneIndex],
        }}
        transition={{ duration: 4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />

      {/* FOREGROUND SCENES */}
      <div className="absolute inset-0 z-10">
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
