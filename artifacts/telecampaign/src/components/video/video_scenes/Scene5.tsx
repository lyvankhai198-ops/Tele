import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 6000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute left-[8%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 5 / CHIẾN DỊCH
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Lên lịch<br/>Thông minh
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Cài đặt thời gian gửi, độ trễ giữa các tin và số lần lặp lại tự động hoàn toàn theo lịch trình.
        </motion.p>
      </div>

      <motion.div
        className="absolute right-[8%] top-[15%] w-[48%] bg-white rounded-[2vw] p-[2vw] shadow-2xl"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.4 }}
      >
         <div className="font-bold text-[#16304a] text-[1.6vw] mb-[4%] pb-[2%] border-b border-[#e2e8f0]">Cấu hình Gửi tin</div>

         <div className="grid grid-cols-2 gap-[2vw] mb-[4%]">
            <div>
               <div className="h-[1vw] w-[40%] bg-[#e2e8f0] rounded mb-[4%]" />
               <div className="h-[3.5vw] border border-[#cbd5e1] rounded-xl flex items-center justify-between px-[6%]">
                 <span className="text-[#1a2b88] font-bold text-[1.1vw]">Gửi ngay lập tức</span>
                 <div className="w-[3vw] h-[1.5vw] bg-[#1888e8] rounded-full relative">
                   <div className="absolute right-[2px] top-[2px] w-[1.2vw] h-[1.2vw] bg-white rounded-full shadow-sm" />
                 </div>
               </div>
            </div>
            <div>
               <div className="h-[1vw] w-[50%] bg-[#e2e8f0] rounded mb-[4%]" />
               <div className="h-[3.5vw] border border-[#cbd5e1] rounded-xl flex items-center justify-between px-[6%] bg-[#f8fafc]">
                 <span className="text-[#64748b] font-bold text-[1.1vw]">10:00 - 15/09/2024</span>
                 <svg className="w-[1.2vw] h-[1.2vw] text-[#64748b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               </div>
            </div>
         </div>

         <motion.div 
           className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[1.5vw] mb-[4%]"
           initial={{ opacity: 0, y: 20 }}
           animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
         >
            <div className="flex justify-between items-center mb-[2%]">
               <div className="font-bold text-[#16304a] text-[1.2vw]">Độ trễ (Delay)</div>
               <div className="text-[#1888e8] font-bold text-[1.1vw]">15s - 30s</div>
            </div>
            <div className="h-[0.5vw] w-full bg-[#e2e8f0] rounded-full relative">
               <div className="absolute left-[20%] right-[40%] h-full bg-[#1888e8] rounded-full" />
               <div className="absolute left-[20%] top-1/2 -translate-y-1/2 w-[1.2vw] h-[1.2vw] bg-white border-2 border-[#1888e8] rounded-full shadow" />
               <div className="absolute right-[40%] top-1/2 -translate-y-1/2 w-[1.2vw] h-[1.2vw] bg-white border-2 border-[#1888e8] rounded-full shadow" />
            </div>
            <div className="text-[#64748b] text-[0.9vw] mt-[2%]">Chống spam bằng cách nghỉ ngẫu nhiên giữa các tin nhắn.</div>
         </motion.div>

         <motion.div 
           className="flex items-center gap-[1vw] border border-[#cbd5e1] rounded-xl p-[1.5vw]"
           initial={{ opacity: 0, y: 20 }}
           animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
         >
           <div className="w-[1.5vw] h-[1.5vw] bg-[#1888e8] rounded flex items-center justify-center text-white">
              <svg className="w-[1vw] h-[1vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
           </div>
           <div>
             <div className="font-bold text-[#16304a] text-[1.2vw]">Lặp lại chiến dịch</div>
             <div className="text-[#64748b] text-[1vw]">Chạy lại 3 lần sau khi hoàn thành.</div>
           </div>
         </motion.div>
      </motion.div>

      {/* Subtitles Overlay */}
      <motion.div
        className="absolute bottom-[8%] left-0 right-0 flex justify-center z-50 pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        exit={{ opacity: 0 }}
      >
        <span className="bg-black/60 backdrop-blur-md text-white px-[2vw] py-[1vw] rounded-full text-[1.4vw] font-medium max-w-[80%] text-center">
          Lên lịch tự động, cài đặt độ trễ ngẫu nhiên chống spam và vòng lặp chiến dịch.
        </span>
      </motion.div>
    </motion.div>
  );
}
