import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 13000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: 'inset(0% 0 0 0)' }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute left-[10%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 1 / ĐĂNG NHẬP
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Bắt đầu với<br/>TeleCampaign
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Đăng nhập an toàn để quản lý toàn bộ tài khoản và chiến dịch Telegram từ một nơi duy nhất.
        </motion.p>
      </div>

      {/* Mockup UI Panel */}
      <motion.div
        className="absolute right-[10%] top-[25%] w-[35%] aspect-[3/4] bg-white rounded-[2vw] p-[3vw] shadow-2xl flex flex-col"
        initial={{ opacity: 0, y: 100, rotateY: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotateY: 0 } : { opacity: 0, y: 100, rotateY: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.2 }}
        style={{ perspective: 1000 }}
      >
        <div className="flex justify-center mb-[4%]">
          <div className="w-[4vw] h-[4vw] bg-[#f3f7fb] rounded-full flex items-center justify-center text-[#1888e8]">
            <svg className="w-[2vw] h-[2vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
        </div>
        <div className="text-center text-[#16304a] font-bold text-[1.6vw] mb-[6%]">Đăng nhập</div>
        
        {/* Username Field */}
        <div className="mb-[4%]">
          <div className="h-[1vw] w-[20%] bg-[#e2e8f0] rounded mb-[2%]" />
          <div className="h-[3.5vw] w-full border border-[#cbd5e1] rounded-xl flex items-center px-[4%] relative overflow-hidden">
             <motion.div 
               className="h-[60%] w-[2px] bg-[#1a2b88] absolute left-[4%]"
               animate={phase >= 3 && phase < 4 ? { opacity: [1, 0, 1] } : { opacity: 0 }}
               transition={{ duration: 0.8, repeat: Infinity }}
             />
             <motion.span 
               className="text-[#16304a] font-medium text-[1.2vw] ml-[2%]"
               initial={{ opacity: 0 }}
               animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
             >
               admin_demo
             </motion.span>
          </div>
        </div>

        {/* Password Field */}
        <div className="mb-[6%]">
          <div className="h-[1vw] w-[20%] bg-[#e2e8f0] rounded mb-[2%]" />
          <div className="h-[3.5vw] w-full border border-[#cbd5e1] rounded-xl flex items-center px-[4%] relative overflow-hidden">
             <motion.div 
               className="h-[60%] w-[2px] bg-[#1a2b88] absolute left-[4%]"
               animate={phase >= 4 && phase < 5 ? { opacity: [1, 0, 1] } : { opacity: 0 }}
               transition={{ duration: 0.8, repeat: Infinity }}
             />
             <motion.span 
               className="text-[#16304a] font-medium text-[1.2vw] tracking-widest ml-[2%]"
               initial={{ opacity: 0 }}
               animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
               transition={{ delay: 0.5 }}
             >
               ••••••••
             </motion.span>
          </div>
        </div>

        {/* Button */}
        <motion.div
          className="h-[4vw] w-full bg-[#1888e8] rounded-xl mt-auto shadow-lg flex items-center justify-center text-white font-bold text-[1.2vw]"
          whileHover={{ scale: 1.02 }}
          animate={phase >= 4 ? { backgroundColor: ['#1888e8', '#1a2b88', '#1888e8'] } : {}}
          transition={{ duration: 2, delay: 1 }}
        >
          Đăng nhập ngay
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
          Chào mừng đến với TeleCampaign. Hãy đăng nhập để bắt đầu!
        </span>
      </motion.div>

    </motion.div>
  );
}
