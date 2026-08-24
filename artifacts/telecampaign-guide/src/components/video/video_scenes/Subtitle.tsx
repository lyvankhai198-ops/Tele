import { motion } from 'framer-motion';

export function Subtitle({ text, show = true }: { text: string; show?: boolean }) {
  return (
    <motion.div
      className="absolute bottom-[6vw] left-0 right-0 flex justify-center z-50 pointer-events-none"
      initial={{ opacity: 0, y: '2vw' }}
      animate={show ? { opacity: 1, y: '0vw' } : { opacity: 0, y: '2vw' }}
      exit={{ opacity: 0, y: '2vw' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="bg-bg-panel/80 backdrop-blur-xl border border-white/10 text-white px-[2vw] py-[1vw] rounded-full text-[1.4vw] font-medium max-w-[80%] text-center shadow-2xl">
        {text}
      </div>
    </motion.div>
  );
}
