import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Form appears
      setTimeout(() => setPhase(3), 4000), // Target selection
      setTimeout(() => setPhase(4), 7000), // Delay/Safety settings
      setTimeout(() => setPhase(5), 10000), // Schedule/Repeat settings
      setTimeout(() => setPhase(6), 13000), // Launching
      setTimeout(() => setPhase(7), 16000), // Success
      setTimeout(() => setPhase(8), 19000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-[6vw] text-center w-full z-10">
        <motion.div
          className="text-primary font-mono font-bold text-[1.2vw] tracking-[0.2em] mb-[1vw]"
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        >
          // BƯỚC 05 : CẤU HÌNH CHIẾN DỊCH
        </motion.div>
      </div>

      <motion.div
        className="w-[60vw] bg-bg-panel/90 backdrop-blur-2xl border border-white/10 rounded-[2vw] p-[3vw] shadow-2xl relative mt-[5vw]"
        initial={{ opacity: 0, y: 50 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      >
        <div className="grid grid-cols-2 gap-[4vw]">
          {/* Left Column */}
          <div className="space-y-[2.5vw]">
            {/* Template Selection */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            >
              <div className="text-[1.2vw] text-text-muted mb-[1vw]">Nội dung gửi</div>
              <div className="bg-bg-panel-light border border-primary/50 rounded-xl p-[1vw] flex items-center gap-[1vw]">
                <div className="w-[3vw] h-[3vw] bg-primary/20 rounded-lg flex items-center justify-center text-primary">📝</div>
                <div className="flex-1 text-[1.2vw] font-bold">Template_Thang10</div>
                <svg className="w-[1.5vw] h-[1.5vw] text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
            </motion.div>

            {/* Target Groups */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
              transition={{ delay: 0.2 }}
            >
              <div className="text-[1.2vw] text-text-muted mb-[1vw]">Nhóm đích (3 nhóm)</div>
              <div className="flex flex-wrap gap-[0.8vw]">
                {['Cộng đồng Crypto', 'Kỹ sư Phần mềm', 'Vinhomes CP'].map((g, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 px-[1vw] py-[0.5vw] rounded-full text-[1vw] flex items-center gap-[0.5vw]">
                    👥 {g}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Column (Settings) */}
          <div className="space-y-[2.5vw]">
            {/* Delay Settings */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
            >
              <div className="flex justify-between items-end mb-[1vw]">
                <div className="text-[1.2vw] text-text-muted">Khoảng trễ an toàn</div>
                <div className="text-warning font-mono font-bold text-[1.2vw]">5s - 15s</div>
              </div>
              <div className="h-[1vw] bg-bg-base rounded-full overflow-hidden relative">
                <motion.div 
                  className="absolute top-0 bottom-0 left-[20%] right-[40%] bg-gradient-to-r from-warning to-error rounded-full"
                  initial={{ scaleX: 0, transformOrigin: 'left' }}
                  animate={phase >= 4 ? { scaleX: 1 } : { scaleX: 0 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              </div>
              <div className="text-[0.9vw] text-warning/80 mt-[0.5vw]">Khuyến nghị: Tránh bị Telegram đánh dấu spam.</div>
            </motion.div>

            {/* Schedule & Repeat */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={phase >= 5 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
            >
              <div className="text-[1.2vw] text-text-muted mb-[1vw]">Lặp lại chiến dịch</div>
              <div className="flex gap-[1vw]">
                <div className="flex-1 bg-bg-panel-light border border-white/10 rounded-xl p-[1vw] flex justify-between items-center text-[1.2vw]">
                  <span>Số lần</span>
                  <span className="font-bold text-accent">3 lần</span>
                </div>
                <div className="flex-1 bg-bg-panel-light border border-white/10 rounded-xl p-[1vw] flex justify-between items-center text-[1.2vw]">
                  <span>Cách nhau</span>
                  <span className="font-bold text-accent">24 giờ</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Launch Button */}
        <motion.div
          className="mt-[4vw] h-[5vw] rounded-xl flex items-center justify-center font-bold text-[1.5vw] text-white relative overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ delay: 0.5 }}
        >
          <motion.div
            className="absolute inset-0 z-0"
            animate={{
              backgroundColor: phase >= 7 ? 'var(--color-success)' : phase >= 6 ? 'var(--color-warning)' : 'var(--color-primary)'
            }}
          />
          
          {phase >= 6 && phase < 7 && (
            <motion.div
              className="absolute left-0 top-0 bottom-0 bg-white/20 z-0"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, ease: 'linear' }}
            />
          )}

          <div className="relative z-10 flex items-center gap-[1vw]">
            {phase < 6 && '🚀 Khởi chạy chiến dịch'}
            {phase >= 6 && phase < 7 && 'Đang chuẩn bị gửi...'}
            {phase >= 7 && '✓ Chiến dịch đang hoạt động'}
          </div>
        </motion.div>
      </motion.div>

      <Subtitle text="Thiết lập tham số gửi an toàn, hẹn giờ và lặp lại chiến dịch hoàn toàn tự động." show={phase >= 1 && phase < 8} />
    </motion.div>
  );
}
