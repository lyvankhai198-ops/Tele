import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ clipPath: 'inset(0 0 100% 0)' }}
      animate={{ clipPath: 'inset(0 0 0% 0)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute left-[10%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 6 / GIÁM SÁT
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Theo dõi<br/>Trực quan
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Bảng điều khiển cung cấp số liệu realtime, chi tiết trạng thái gửi tin và cảnh báo nếu có lỗi.
        </motion.p>
      </div>

      <motion.div
        className="absolute right-[10%] top-[20%] w-[45%] bg-[#f8fafc] rounded-[2vw] p-[2vw] shadow-2xl border border-[#e2e8f0]"
        initial={{ opacity: 0, rotateX: 20 }}
        animate={phase >= 2 ? { opacity: 1, rotateX: 0 } : { opacity: 0, rotateX: 20 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.3 }}
        style={{ perspective: 1000 }}
      >
         <div className="grid grid-cols-2 gap-[1.5vw] mb-[3vw]">
            <motion.div 
               className="bg-white p-[1.5vw] rounded-xl shadow-sm border border-[#eef2f6]"
               initial={{ opacity: 0, scale: 0.8 }}
               animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            >
               <div className="text-[#64748b] font-bold text-[1vw] mb-[1vw]">ĐÃ GỬI HÔM NAY</div>
               <div className="text-[#1a2b88] font-extrabold text-[2.5vw]">12,540</div>
            </motion.div>
            <motion.div 
               className="bg-white p-[1.5vw] rounded-xl shadow-sm border border-[#eef2f6]"
               initial={{ opacity: 0, scale: 0.8 }}
               animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
               transition={{ delay: 0.2 }}
            >
               <div className="text-[#64748b] font-bold text-[1vw] mb-[1vw]">TỶ LỆ THÀNH CÔNG</div>
               <div className="text-[#10b981] font-extrabold text-[2.5vw]">98.5%</div>
            </motion.div>
         </div>

         <motion.div 
            className="bg-white p-[1.5vw] rounded-xl shadow-sm border border-[#eef2f6]"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ delay: 0.4 }}
         >
            <div className="flex justify-between items-center mb-[1.5vw]">
               <div className="font-bold text-[#16304a] text-[1.4vw]">Chiến dịch đang chạy</div>
               <div className="w-[1vw] h-[1vw] bg-[#10b981] rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            </div>
            
            <div className="space-y-[1vw]">
               {[1, 2].map((i) => (
                 <div key={i} className="flex justify-between items-center bg-[#f8fafc] p-[1vw] rounded-lg">
                   <div>
                      <div className="font-bold text-[#1a2b88] text-[1.1vw]">CD Khuyến mãi T9 #{i}</div>
                      <div className="text-[#64748b] text-[0.9vw]">Tiến độ: {i === 1 ? '450/500' : '120/1000'}</div>
                   </div>
                   <div className="w-[10vw] h-[0.6vw] bg-[#e2e8f0] rounded-full overflow-hidden">
                     <motion.div 
                        className="h-full bg-[#1888e8]" 
                        initial={{ width: 0 }}
                        animate={phase >= 3 ? { width: i === 1 ? '90%' : '12%' } : { width: 0 }}
                        transition={{ duration: 1.5, delay: 0.8 }}
                     />
                   </div>
                 </div>
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
          Kiểm soát toàn bộ số liệu và tiến độ chiến dịch trực tiếp trên Dashboard.
        </span>
      </motion.div>
    </motion.div>
  );
}
