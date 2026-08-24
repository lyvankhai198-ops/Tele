import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Subtitle } from './Subtitle';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Start syncing
      setTimeout(() => setPhase(3), 3500), // Group 1
      setTimeout(() => setPhase(4), 5000), // Group 2
      setTimeout(() => setPhase(5), 6500), // Group 3
      setTimeout(() => setPhase(6), 9000), // Done
      setTimeout(() => setPhase(7), 13000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const groups = [
    { id: 1, name: 'Cộng đồng Đầu tư Crypto', members: '12.5k', topic: 'Tin tức thị trường', phaseTrigger: 3 },
    { id: 2, name: 'Nhóm Kỹ sư Phần mềm VN', members: '8.2k', topic: 'Thảo luận kỹ thuật', phaseTrigger: 4 },
    { id: 3, name: 'Cư dân Vinhomes Central Park', members: '4.1k', topic: 'Thông báo BQL', phaseTrigger: 5 },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-[8vw] gap-[4vw]"
      initial={{ x: '100vw' }}
      animate={{ x: 0 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 1.2, type: 'spring', stiffness: 80, damping: 20 }}
    >
      {/* Left side: Sync status */}
      <div className="w-[35%]">
        <motion.div
          className="text-secondary font-mono font-bold text-[1.2vw] tracking-[0.2em] mb-[1vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        >
          // BƯỚC 03 : ĐỒNG BỘ
        </motion.div>
        
        <motion.h2
          className="font-display font-extrabold text-[3.5vw] leading-tight mb-[2vw] text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        >
          Đồng bộ<br/>Nhóm & Topics
        </motion.h2>

        <motion.div
          className="bg-bg-panel border border-white/10 rounded-2xl p-[2vw] flex items-center gap-[1.5vw]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        >
          <div className="relative w-[4vw] h-[4vw] flex items-center justify-center">
            {phase >= 2 && phase < 6 && (
              <motion.div
                className="absolute inset-0 border-[3px] border-secondary/30 rounded-full border-t-secondary"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            )}
            {phase >= 6 && (
              <motion.div
                className="bg-success rounded-full p-[0.5vw]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
              >
                <svg className="w-[2.5vw] h-[2.5vw] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              </motion.div>
            )}
            {phase >= 2 && phase < 6 && (
              <svg className="w-[2vw] h-[2vw] text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
          </div>
          <div>
            <div className="font-bold text-[1.4vw]">
              {phase < 6 ? 'Đang đồng bộ dữ liệu...' : 'Đồng bộ hoàn tất'}
            </div>
            <div className="text-text-muted text-[1vw] font-mono mt-[0.3vw]">
              {phase < 6 ? 'Fetching telegram_api/groups' : '3 nhóm được tìm thấy'}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side: List of groups */}
      <div className="w-[55%] flex flex-col gap-[1.5vw]">
        {groups.map((group) => (
          <motion.div
            key={group.id}
            className="bg-bg-panel border border-white/5 rounded-2xl p-[1.5vw] flex items-center justify-between"
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={phase >= group.phaseTrigger ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <div className="flex items-center gap-[1.5vw]">
              <div className="w-[4vw] h-[4vw] rounded-full bg-gradient-to-br from-secondary/20 to-primary/20 flex items-center justify-center border border-white/10 text-[1.5vw]">
                👥
              </div>
              <div>
                <div className="font-bold text-[1.4vw] mb-[0.2vw]">{group.name}</div>
                <div className="flex gap-[1vw] text-[1vw] text-text-muted">
                  <span className="flex items-center gap-[0.3vw]">
                    <svg className="w-[1.2vw] h-[1.2vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    {group.members}
                  </span>
                  <span className="flex items-center gap-[0.3vw] bg-white/5 px-[0.5vw] py-[0.1vw] rounded">
                    # {group.topic}
                  </span>
                </div>
              </div>
            </div>
            
            <motion.div
              className="w-[2vw] h-[2vw] rounded-md border-2 border-secondary flex items-center justify-center bg-secondary"
              initial={{ scale: 0 }}
              animate={phase >= group.phaseTrigger + 1 ? { scale: 1 } : { scale: 0 }}
            >
              <svg className="w-[1.5vw] h-[1.5vw] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </motion.div>
          </motion.div>
        ))}
      </div>

      <Subtitle text="Tự động đồng bộ toàn bộ danh sách nhóm và các Topic thảo luận từ tài khoản của bạn." show={phase >= 1 && phase < 7} />
    </motion.div>
  );
}
