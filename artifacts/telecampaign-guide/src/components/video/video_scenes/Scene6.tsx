import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Dashboard appears
      setTimeout(() => setPhase(3), 3500), // Log 1
      setTimeout(() => setPhase(4), 5000), // Log 2
      setTimeout(() => setPhase(5), 7000), // Progress to 66%
      setTimeout(() => setPhase(6), 9000), // Log 3
      setTimeout(() => setPhase(7), 11000), // Progress 100%, Success
      setTimeout(() => setPhase(8), 15000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const logs = [
    { id: 1, group: 'Cộng đồng Đầu tư Crypto', status: 'Sent', time: '10:45:02', phaseTrigger: 3 },
    { id: 2, group: 'Nhóm Kỹ sư Phần mềm VN', status: 'Sent', time: '10:45:15', phaseTrigger: 4 },
    { id: 3, group: 'Cư dân Vinhomes Central Park', status: 'Sent', time: '10:45:22', phaseTrigger: 6 },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.2, opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full flex justify-between items-end mb-[3vw]">
        <div>
          <motion.div
            className="text-success font-mono font-bold text-[1.2vw] tracking-[0.2em] mb-[1vw]"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            // BƯỚC 06 : THEO DÕI
          </motion.div>
          <motion.h2
            className="font-display font-extrabold text-[3vw] text-white"
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ delay: 0.1 }}
          >
            Giám sát thời gian thực
          </motion.h2>
        </div>
        
        <motion.div
          className="flex gap-[2vw]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="bg-bg-panel border border-white/10 rounded-2xl p-[1.5vw] min-w-[12vw]">
            <div className="text-text-muted text-[1vw] mb-[0.5vw]">Đã gửi</div>
            <div className="text-success font-display font-bold text-[3vw] leading-none">
              {phase >= 7 ? '3' : phase >= 5 ? '2' : phase >= 3 ? '1' : '0'}
              <span className="text-[1.5vw] text-text-muted">/3</span>
            </div>
          </div>
          <div className="bg-bg-panel border border-white/10 rounded-2xl p-[1.5vw] min-w-[12vw]">
            <div className="text-text-muted text-[1vw] mb-[0.5vw]">Lỗi</div>
            <div className="text-error font-display font-bold text-[3vw] leading-none">0</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="w-full bg-bg-panel border border-white/10 rounded-[2vw] p-[3vw] shadow-2xl relative overflow-hidden"
        initial={{ opacity: 0, y: 50 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.2 }}
      >
        {/* Progress Bar */}
        <div className="mb-[3vw]">
          <div className="flex justify-between text-[1.2vw] mb-[1vw] font-bold">
            <span className="text-primary">Tiến độ gửi (Lượt 1)</span>
            <span className="text-white">
              {phase >= 7 ? '100%' : phase >= 5 ? '66%' : phase >= 3 ? '33%' : '0%'}
            </span>
          </div>
          <div className="h-[1.5vw] bg-bg-base rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-primary"
              initial={{ width: '0%' }}
              animate={{ 
                width: phase >= 7 ? '100%' : phase >= 5 ? '66%' : phase >= 3 ? '33%' : '0%',
                backgroundColor: phase >= 7 ? 'var(--color-success)' : 'var(--color-primary)'
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Live Logs */}
        <div className="space-y-[1vw]">
          <div className="grid grid-cols-12 text-text-muted font-bold text-[1vw] mb-[1vw] px-[1vw]">
            <div className="col-span-2">THỜI GIAN</div>
            <div className="col-span-8">ĐÍCH ĐẾN</div>
            <div className="col-span-2 text-right">TRẠNG THÁI</div>
          </div>
          
          {logs.map((log) => (
            <motion.div
              key={log.id}
              className="grid grid-cols-12 bg-white/5 border border-white/5 rounded-xl p-[1vw] items-center text-[1.2vw]"
              initial={{ opacity: 0, x: -50, scale: 0.95 }}
              animate={phase >= log.phaseTrigger ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -50, scale: 0.95 }}
              transition={{ type: 'spring' }}
            >
              <div className="col-span-2 font-mono text-text-secondary">{log.time}</div>
              <div className="col-span-8 font-bold text-white flex items-center gap-[1vw]">
                <div className="w-[2vw] h-[2vw] rounded bg-white/10 flex items-center justify-center text-[1vw]">
                  👥
                </div>
                {log.group}
              </div>
              <div className="col-span-2 text-right flex items-center justify-end gap-[0.5vw] text-success font-bold">
                <svg className="w-[1.5vw] h-[1.5vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                Thành công
              </div>
            </motion.div>
          ))}
        </div>

        {/* Success Overlay */}
        <motion.div
          className="absolute inset-0 bg-success/10 backdrop-blur-[2px] flex items-center justify-center z-10"
          initial={{ opacity: 0 }}
          animate={phase >= 7 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          <motion.div
            className="bg-bg-panel border border-success/30 px-[4vw] py-[2vw] rounded-2xl shadow-2xl flex flex-col items-center"
            initial={{ scale: 0.8, y: 50 }}
            animate={phase >= 7 ? { scale: 1, y: 0 } : { scale: 0.8, y: 50 }}
            transition={{ type: 'spring', delay: 0.5 }}
          >
            <div className="w-[6vw] h-[6vw] rounded-full bg-success/20 flex items-center justify-center mb-[1vw]">
              <svg className="w-[4vw] h-[4vw] text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div className="text-[2vw] font-bold text-white">Chiến dịch hoàn tất!</div>
            <div className="text-[1.2vw] text-text-muted mt-[0.5vw]">Chờ lượt lặp lại tiếp theo...</div>
          </motion.div>
        </motion.div>

      </motion.div>

      <Subtitle text="Kiểm soát toàn bộ quá trình gửi qua giao diện trực quan và minh bạch." show={phase >= 1 && phase < 8} />
    </motion.div>
  );
}
