import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute left-[10%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 3 / ĐỒNG BỘ
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Đồng bộ<br/>Nhóm & Chủ đề
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Hệ thống tự động quét và phân loại các nhóm, bao gồm cả Topics (Forum) từ tài khoản của bạn.
        </motion.p>
      </div>

      <motion.div
        className="absolute right-[10%] top-[20%] w-[40%] bg-white rounded-[2vw] p-[2vw] shadow-2xl"
        initial={{ opacity: 0, y: 50 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.3 }}
      >
         <div className="flex justify-between items-center mb-[4%] pb-[2%] border-b border-[#e2e8f0]">
           <div className="font-bold text-[#16304a] text-[1.6vw]">Danh sách Nhóm</div>
           <motion.div 
             className="bg-[#10b981] text-white px-[1vw] py-[0.5vw] rounded-lg text-[1vw] font-bold flex items-center gap-[0.5vw]"
             animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
           >
             <svg className="w-[1.5vw] h-[1.5vw] animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
             Đang đồng bộ...
           </motion.div>
         </div>

         <div className="space-y-[1.5vw]">
            {['Crypto Traders VN', 'Marketing Automation', 'DevOps Community'].map((group, i) => (
              <motion.div 
                key={i}
                className="flex items-center justify-between p-[1.5vw] border border-[#e2e8f0] rounded-xl"
                initial={{ opacity: 0, x: 20 }}
                animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ delay: i * 0.2 }}
              >
                <div className="flex items-center gap-[1vw]">
                  <div className="w-[3vw] h-[3vw] bg-[#f8fafc] rounded-full flex items-center justify-center text-[#64748b] text-[1.2vw] font-bold">
                    {group.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-[#1a2b88] text-[1.2vw]">{group}</div>
                    <div className="text-[#64748b] text-[0.9vw]">{i === 1 ? '5 Topics' : 'Nhóm thường'}</div>
                  </div>
                </div>
                <div className="text-[#10b981] bg-[#ecfdf5] px-[1vw] py-[0.3vw] rounded-full text-[0.9vw] font-bold">
                  Đã đồng bộ
                </div>
              </motion.div>
            ))}
         </div>
      </motion.div>

      {/* Subtitles Overlay */}
      <motion.div
        className="absolute bottom-[8%] left-0 right-0 flex justify-center z-50 pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        exit={{ opacity: 0 }}
      >
        <span className="bg-black/60 backdrop-blur-md text-white px-[2vw] py-[1vw] rounded-full text-[1.4vw] font-medium max-w-[80%] text-center">
          Tự động lấy toàn bộ danh sách nhóm và các chủ đề (Topics).
        </span>
      </motion.div>
    </motion.div>
  );
}
