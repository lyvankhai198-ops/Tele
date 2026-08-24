import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = {
  login: 15000,
  connect: 16000,
  sync: 15000,
  template: 16000,
  campaign: 18000,
  monitor: 15000,
};

const ACCENT_LINE = [
  { left: '10%', top: '80%', width: '20%' }, // Login
  { left: '40%', top: '20%', width: '25%' }, // Connect
  { left: '60%', top: '85%', width: '30%' }, // Sync
  { left: '15%', top: '75%', width: '25%' }, // Template
  { left: '30%', top: '90%', width: '40%' }, // Campaign
  { left: '20%', top: '50%', width: '15%' }, // Monitor
];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center bg-[#0b1420]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Background Layer: Tech Grid + Glow */}
      <motion.div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)',
          backgroundSize: '4% 7.11%', // aspect ratio aware grid
        }}
        animate={{ backgroundPosition: ['0% 0%', '4% 7.11%'] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute w-[60%] aspect-square rounded-full blur-[80px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(24,136,232,0.15), transparent 70%)' }}
        animate={{
          left: ['5%', '40%', '20%', '50%', '10%', '30%'][currentScene],
          top: ['20%', '-10%', '30%', '5%', '40%', '10%'][currentScene],
        }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Persistent Accent Line */}
      <motion.div
        className="absolute h-[2px] z-10"
        style={{ backgroundColor: '#1888e8' }}
        animate={ACCENT_LINE[currentScene]}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="absolute inset-0 z-20">
        <AnimatePresence mode="sync">
          {currentScene === 0 && <Scene1 key="login" />}
          {currentScene === 1 && <Scene2 key="connect" />}
          {currentScene === 2 && <Scene3 key="sync" />}
          {currentScene === 3 && <Scene4 key="template" />}
          {currentScene === 4 && <Scene5 key="campaign" />}
          {currentScene === 5 && <Scene6 key="monitor" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
