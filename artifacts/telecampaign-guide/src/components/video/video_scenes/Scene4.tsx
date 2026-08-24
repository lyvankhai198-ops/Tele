import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Builder up
      setTimeout(() => setPhase(3), 3500), // Typing starts
      setTimeout(() => setPhase(4), 6000), // Typing ends, image attach
      setTimeout(() => setPhase(5), 8000), // Preview bubble pops in
      setTimeout(() => setPhase(6), 11000), // Done
      setTimeout(() => setPhase(7), 17000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const typedText = "🔥 Thông báo cập nhật dự án tháng 10\n\nKính gửi cộng đồng,\nChúng tôi vừa ra mắt tính năng mới giúp tối ưu hóa...\n\n👉 Chi tiết xem tại website.";

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center pt-[5vw]"
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0, rotateX: 20 }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1200 }}
    >
      <div className="absolute top-[8vw] left-[8vw] z-10 text-left">
        <motion.div
          className="text-accent font-mono font-bold text-[1vw] tracking-[0.2em] mb-[1vw]"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        >
          // BƯỚC 04 : NỘI DUNG
        </motion.div>
        <motion.h2
          className="font-display font-extrabold text-[3vw] text-white leading-tight"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ delay: 0.1 }}
        >
          Soạn thảo<br/>Template
        </motion.h2>
      </div>

      <div className="flex w-[80vw] h-[35vw] gap-[4vw] mt-[5vw] relative z-20">
        {/* Left side: Editor */}
        <motion.div
          className="w-1/2 bg-bg-panel border border-white/10 rounded-[2vw] shadow-2xl flex flex-col overflow-hidden"
          initial={{ opacity: 0, y: 100, rotateY: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, rotateY: 0 } : { opacity: 0, y: 100, rotateY: 30 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <div className="bg-white/5 border-b border-white/5 p-[1.5vw] flex items-center gap-[1vw]">
            <div className="w-[1vw] h-[1vw] rounded-full bg-error" />
            <div className="w-[1vw] h-[1vw] rounded-full bg-warning" />
            <div className="w-[1vw] h-[1vw] rounded-full bg-success" />
            <div className="ml-[2vw] text-[1.2vw] font-bold text-text-secondary">Template_Thang10</div>
          </div>
          
          <div className="p-[2vw] flex-1 relative">
            <motion.div
              className="absolute text-[1.4vw] text-white whitespace-pre-wrap font-body leading-[1.6]"
              initial={{ clipPath: 'inset(0 100% 100% 0)' }}
              animate={phase >= 3 ? { clipPath: 'inset(0 0% 0% 0)' } : { clipPath: 'inset(0 100% 100% 0)' }}
              transition={{ duration: 2.5, ease: 'linear' }}
            >
              {typedText}
            </motion.div>
            
            <motion.div
              className="w-[2px] h-[1.6em] bg-accent absolute top-[2vw]"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </div>

          <div className="p-[1.5vw] border-t border-white/5 bg-white/5 flex gap-[1vw]">
            <motion.div 
              className="w-[3vw] h-[3vw] bg-white/10 rounded-lg flex items-center justify-center text-white"
              whileHover={{ scale: 1.05 }}
            >
              <svg className="w-[1.5vw] h-[1.5vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </motion.div>
            <motion.div 
              className="w-[3vw] h-[3vw] bg-white/10 rounded-lg flex items-center justify-center text-white"
              whileHover={{ scale: 1.05 }}
            >
              😀
            </motion.div>
            <motion.div
              className="ml-auto bg-primary text-white px-[2vw] py-[0.8vw] rounded-lg font-bold text-[1.2vw]"
              initial={{ scale: 1 }}
              animate={phase >= 5 ? { backgroundColor: 'var(--color-success)', scale: 1.05 } : {}}
            >
              Lưu Template
            </motion.div>
          </div>
        </motion.div>

        {/* Right side: Telegram preview */}
        <motion.div
          className="w-1/2 flex items-center justify-center"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 5 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        >
          <div className="w-[30vw] bg-[url('https://web.telegram.org/img/bg-pattern-dark.png')] bg-cover bg-center rounded-[2vw] border-[0.5vw] border-bg-panel shadow-[0_0_50px_rgba(24,136,232,0.3)] overflow-hidden flex flex-col">
            <div className="bg-bg-panel/90 backdrop-blur-md p-[1vw] text-center border-b border-white/10">
              <div className="font-bold text-[1.2vw] text-white">Xem trước hiển thị</div>
            </div>
            
            <div className="flex-1 p-[1.5vw] flex flex-col justify-end">
              <motion.div
                className="bg-[#2b5278] rounded-2xl rounded-br-none p-[1.5vw] text-white text-[1.1vw] shadow-md ml-[2vw]"
                initial={{ scale: 0.8, opacity: 0, y: 20, transformOrigin: 'bottom right' }}
                animate={phase >= 5 ? { scale: 1, opacity: 1, y: 0 } : {}}
                transition={{ type: 'spring', delay: 0.3 }}
              >
                {phase >= 4 && (
                  <div className="w-full h-[12vw] bg-black/30 rounded-lg mb-[1vw] flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent/40 to-primary/40" />
                    <svg className="w-[4vw] h-[4vw] text-white/50 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{typedText}</div>
                <div className="text-right text-[0.8vw] text-white/50 mt-[0.5vw]">10:42 AM ✓✓</div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      <Subtitle text="Soạn thảo nội dung trực quan và xem trước hiển thị thực tế trên Telegram." show={phase >= 1 && phase < 7} />
    </motion.div>
  );
}
