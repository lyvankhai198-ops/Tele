import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 7000), // QR scan effect
      setTimeout(() => setPhase(6), 10000), // Connected state
      setTimeout(() => setPhase(7), 14000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  // Generate grid cells for a pseudo QR code look
  const qrCells = Array.from({ length: 64 }).map((_, i) => ({
    id: i,
    active: Math.random() > 0.4,
  }));

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="text-center mb-[4vw]"
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-accent font-mono font-bold text-[1.2vw] tracking-[0.2em] mb-[1vw]">
          // BƯỚC 02 : KẾT NỐI
        </div>
        <h2 className="font-display font-extrabold text-[3.5vw] text-white">Liên kết Telegram</h2>
      </motion.div>

      <motion.div
        className="w-[50vw] h-[25vw] bg-bg-panel border border-white/10 rounded-[2vw] flex shadow-[0_0_100px_rgba(56,189,248,0.15)] relative overflow-hidden"
        initial={{ opacity: 0, y: 50, rotateX: -10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -10 }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{ perspective: 1000 }}
      >
        {/* Left side: Instructions */}
        <div className="w-1/2 p-[3vw] border-r border-white/5 flex flex-col justify-center">
          <motion.div
            className="flex items-center gap-[1vw] mb-[2vw]"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            <div className="w-[3vw] h-[3vw] rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-[1.2vw]">1</div>
            <div className="text-[1.3vw] font-medium">Mở ứng dụng Telegram</div>
          </motion.div>
          
          <motion.div
            className="flex items-center gap-[1vw] mb-[2vw]"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            <div className="w-[3vw] h-[3vw] rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-[1.2vw]">2</div>
            <div className="text-[1.3vw] font-medium">Vào Cài đặt {'>'} Thiết bị</div>
          </motion.div>
          
          <motion.div
            className="flex items-center gap-[1vw]"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 5 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            <div className="w-[3vw] h-[3vw] rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-[1.2vw]">3</div>
            <div className="text-[1.3vw] font-medium">Quét mã QR để đăng nhập</div>
          </motion.div>
        </div>

        {/* Right side: QR Code Area */}
        <div className="w-1/2 flex items-center justify-center bg-bg-panel-light/30 relative">
          <motion.div
            className="w-[16vw] h-[16vw] bg-white rounded-2xl p-[1vw] relative flex flex-wrap gap-[0.2vw] content-start overflow-hidden"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', delay: 0.2 }}
          >
            {qrCells.map((cell, i) => (
              <motion.div
                key={cell.id}
                className="w-[calc(12.5%-0.2vw)] h-[calc(12.5%-0.2vw)] bg-bg-base rounded-sm"
                initial={{ opacity: 0, scale: 0 }}
                animate={phase >= 4 ? { opacity: cell.active ? 1 : 0, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.3, delay: i * 0.01 }}
              />
            ))}
            
            {/* Scan Line effect */}
            <motion.div
              className="absolute left-0 right-0 h-[4px] bg-accent shadow-[0_0_15px_var(--color-accent)] z-10"
              initial={{ top: '0%', opacity: 0 }}
              animate={phase >= 5 && phase < 6 ? { top: ['0%', '100%', '0%'], opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Success Overlay */}
            <motion.div
              className="absolute inset-0 bg-success/90 backdrop-blur-sm flex items-center justify-center flex-col z-20"
              initial={{ opacity: 0 }}
              animate={phase >= 6 ? { opacity: 1 } : { opacity: 0 }}
            >
              <svg className="w-[6vw] h-[6vw] text-white mb-[1vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="text-white font-bold text-[1.5vw]">Đã kết nối</div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      <Subtitle text="Kết nối tài khoản Telegram cá nhân bằng mã QR để hệ thống có thể thao tác thay bạn." show={phase >= 1 && phase < 7} />
    </motion.div>
  );
}
