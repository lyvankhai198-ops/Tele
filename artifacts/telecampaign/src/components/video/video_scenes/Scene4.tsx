import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
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
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute right-[10%] top-[30%] w-[35%]">
        <motion.div
          className="text-[#1888e8] font-bold text-[1.5vw] tracking-wider mb-[2%] text-right"
          initial={{ opacity: 0, x: 30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          BƯỚC 4 / MẪU TIN NHẮN
        </motion.div>
        <motion.h1
          className="text-[#f3f7fb] font-extrabold text-[3.5vw] leading-tight mb-[4%] text-right"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Soạn thảo<br/>Nội dung
        </motion.h1>
        <motion.p
          className="text-[#66809a] text-[1.4vw] leading-relaxed text-right"
          initial={{ opacity: 0, filter: 'blur(5px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Tạo các mẫu tin nhắn với đầy đủ định dạng văn bản, thêm hình ảnh, video và quản lý thư viện mẫu.
        </motion.p>
      </div>

      <motion.div
        className="absolute left-[10%] top-[20%] w-[45%] bg-white rounded-[2vw] p-[2vw] shadow-2xl"
        initial={{ opacity: 0, x: -50, rotate: -2 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, rotate: 0 } : { opacity: 0, x: -50, rotate: -2 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.3 }}
      >
         <div className="flex justify-between items-center mb-[4%] pb-[2%] border-b border-[#e2e8f0]">
           <div className="font-bold text-[#16304a] text-[1.6vw]">Mẫu tin nhắn mới</div>
         </div>

         <div className="mb-[3%]">
           <div className="h-[1vw] w-[30%] bg-[#e2e8f0] rounded mb-[2%]" />
           <div className="h-[3.5vw] border border-[#cbd5e1] rounded-xl flex items-center px-[4%] text-[#1a2b88] font-bold text-[1.2vw]">
             [Khuyến mãi] Giảm giá 50% tháng 9
           </div>
         </div>

         <div className="mb-[4%]">
           <div className="h-[1vw] w-[20%] bg-[#e2e8f0] rounded mb-[2%]" />
           <div className="h-[10vw] border border-[#cbd5e1] rounded-xl p-[4%] text-[#16304a] font-medium text-[1.1vw] relative overflow-hidden">
             Chào các bạn, tháng 9 này TeleCampaign mang đến chương trình ưu đãi đặc biệt giảm 50% cho tất cả các gói...
             <motion.div 
               className="absolute bottom-[1vw] right-[2vw] flex gap-[1vw]"
               initial={{ opacity: 0 }}
               animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
               transition={{ delay: 0.5 }}
             >
               <div className="w-[2vw] h-[2vw] bg-[#eef6fc] rounded flex items-center justify-center text-[#1888e8]">
                  <svg className="w-[1.2vw] h-[1.2vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               </div>
               <div className="w-[2vw] h-[2vw] bg-[#eef6fc] rounded flex items-center justify-center text-[#1888e8]">
                  <svg className="w-[1.2vw] h-[1.2vw]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               </div>
             </motion.div>
           </div>
         </div>

         <div className="flex justify-end">
           <motion.div
             className="bg-[#1888e8] text-white px-[2vw] py-[1vw] rounded-xl font-bold text-[1.1vw]"
             whileHover={{ scale: 1.05 }}
           >
             Lưu mẫu
           </motion.div>
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
          Soạn sẵn tin nhắn mẫu với hình ảnh và video để sử dụng cho chiến dịch.
        </span>
      </motion.div>
    </motion.div>
  );
}
