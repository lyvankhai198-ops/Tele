import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 8000),
      setTimeout(() => setPhase(6), 11000), // Action happening
      setTimeout(() => setPhase(7), 13000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[10vw]"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left side text */}
      <div className="w-[40%] flex flex-col justify-center h-full relative z-10">
        <motion.div
          className="text-primary font-mono font-bold text-[1.2vw] tracking-[0.2em] mb-[1.5vw]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          // BƯỚC 01 : KHỞI TẠO
        </motion.div>
        
        <motion.h1
          className="font-display font-extrabold text-[4.5vw] leading-[1.1] mb-[2vw] text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Bắt đầu với<br/>
          <span className="text-primary">TeleCampaign</span>
        </motion.h1>
        
        <motion.p
          className="text-text-secondary text-[1.4vw] leading-relaxed max-w-[90%]"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          Truy cập hệ thống an toàn để quản lý toàn bộ chiến dịch nhắn tin Telegram của bạn.
        </motion.p>
      </div>

      {/* Right side abstract login panel */}
      <motion.div
        className="w-[32vw] bg-bg-panel border border-white/5 rounded-[2vw] p-[3vw] shadow-[0_0_80px_rgba(0,0,0,0.5)] relative z-10"
        initial={{ opacity: 0, x: 100, rotateY: 20 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 100, rotateY: 20 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.2 }}
        style={{ perspective: 1000 }}
      >
        <div className="flex items-center gap-[1vw] mb-[3vw]">
          <div className="w-[3vw] h-[3vw] rounded-lg bg-primary/20 flex items-center justify-center text-primary">
            <svg className="w-[1.5vw] h-[1.5vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <div className="font-display font-bold text-[1.8vw]">Đăng nhập hệ thống</div>
        </div>

        {/* Username Field */}
        <div className="mb-[2vw]">
          <div className="text-[1vw] text-text-muted mb-[0.8vw] font-mono">Tài khoản</div>
          <div className="h-[3.5vw] w-full bg-bg-panel-light border border-white/10 rounded-xl flex items-center px-[1.5vw] relative">
            <motion.div 
              className="h-[50%] w-[2px] bg-primary absolute left-[1.5vw]"
              animate={phase >= 3 && phase < 4 ? { opacity: [1, 0, 1] } : { opacity: 0 }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <motion.span 
              className="text-white font-mono text-[1.2vw] ml-[1vw]"
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            >
              demo_agency
            </motion.span>
          </div>
        </div>

        {/* Password Field */}
        <div className="mb-[3vw]">
          <div className="text-[1vw] text-text-muted mb-[0.8vw] font-mono">Mật khẩu</div>
          <div className="h-[3.5vw] w-full bg-bg-panel-light border border-white/10 rounded-xl flex items-center px-[1.5vw] relative">
            <motion.div 
              className="h-[50%] w-[2px] bg-primary absolute left-[1.5vw]"
              animate={phase >= 4 && phase < 5 ? { opacity: [1, 0, 1] } : { opacity: 0 }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <motion.span 
              className="text-white font-mono text-[1.2vw] tracking-[0.3em] ml-[1vw]"
              initial={{ opacity: 0 }}
              animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
            >
              ••••••••
            </motion.span>
          </div>
        </div>

        {/* Login Button */}
        <motion.div
          className="h-[4vw] w-full rounded-xl flex items-center justify-center font-bold text-[1.2vw] text-white relative overflow-hidden"
          animate={{
            backgroundColor: phase >= 6 ? 'var(--color-success)' : 'var(--color-primary)',
          }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="absolute inset-0 bg-white/20"
            initial={{ x: '-100%' }}
            animate={phase >= 6 ? { x: '100%' } : { x: '-100%' }}
            transition={{ duration: 0.6 }}
          />
          {phase >= 6 ? 'Đã kết nối' : 'Đăng nhập'}
        </motion.div>
      </motion.div>

      <Subtitle text="Chào mừng bạn đến với hệ thống quản trị TeleCampaign." show={phase >= 1 && phase < 7} />
    </motion.div>
  );
}
