import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 7000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute right-[10%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%] text-right"
          initial={{ opacity: 0, x: 30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 2 / TÀI KHOẢN
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%] text-right"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Kết nối<br/>Telegram
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed text-right"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Thêm số điện thoại và nhập mã OTP. Hỗ trợ proxy để bảo vệ kết nối của bạn.
        </motion.p>
      </div>

      {/* Mockup UI Panel */}
      <motion.div
        className="absolute left-[10%] top-[25%] w-[45%] bg-white rounded-[2vw] p-[2vw] shadow-2xl overflow-hidden"
        initial={{ opacity: 0, x: -50, scale: 0.95 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -50, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.3 }}
      >
        <div className="flex justify-between items-center mb-[4%] pb-[2%] border-b border-[#e2e8f0]">
           <div className="font-bold text-[#16304a] text-[1.6vw]">Thêm tài khoản mới</div>
        </div>

        <div className="flex gap-[2vw] mb-[4%]">
          <div className="flex-1">
            <div className="h-[1vw] w-[40%] bg-[#e2e8f0] rounded mb-[2%]" />
            <div className="h-[3.5vw] border border-[#cbd5e1] rounded-xl flex items-center px-[4%] text-[#1a2b88] font-bold text-[1.2vw]">
              +84 912 345 678
            </div>
          </div>
          <div className="flex-1">
             <div className="h-[1vw] w-[30%] bg-[#e2e8f0] rounded mb-[2%]" />
             <div className="h-[3.5vw] border border-[#cbd5e1] rounded-xl flex items-center px-[4%] text-[#64748b] font-medium text-[1vw]">
               Chọn Proxy (Tùy chọn)
             </div>
          </div>
        </div>

        <motion.div 
           className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[2vw]"
           initial={{ opacity: 0, height: 0 }}
           animate={phase >= 3 ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
        >
           <div className="text-center font-bold text-[#16304a] text-[1.4vw] mb-[4%]">Nhập mã xác thực (OTP)</div>
           <div className="flex justify-center gap-[1vw]">
             {[5, 2, 8, 1, 9].map((num, i) => (
               <motion.div
                 key={i}
                 className="w-[4vw] h-[5vw] bg-white border-2 border-[#1888e8] rounded-xl flex items-center justify-center text-[2vw] font-bold text-[#1a2b88] shadow-sm"
                 initial={{ scale: 0, opacity: 0 }}
                 animate={phase >= 4 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                 transition={{ delay: i * 0.1, type: 'spring' }}
               >
                 {num}
               </motion.div>
             ))}
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
          Nhập số điện thoại và kết nối tài khoản bằng mã OTP an toàn.
        </span>
      </motion.div>
    </motion.div>
  );
}
