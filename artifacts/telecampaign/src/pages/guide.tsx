import { AppLayout } from "@/components/layout/AppLayout";
import VideoTemplate from "@/components/video/VideoTemplate";
import { useLanguage } from "@/lib/i18n";

export default function Guide() {
  const { t } = useLanguage();
  return (
    <AppLayout activePage="guide" title={t("Hướng dẫn sử dụng")}>
      <div className="w-full max-w-[1200px] mx-auto bg-white border border-[#eef2f6] rounded-3xl overflow-hidden shadow-sm">
         <div className="p-6 border-b border-[#eef2f6] bg-[#f8fafc]">
            <h2 className="text-[20px] font-extrabold text-[#0f172a] tracking-tight">Video Hướng Dẫn</h2>
            <p className="text-[#64748b] font-medium mt-1">Xem video để hiểu rõ luồng thao tác và cách thiết lập chiến dịch trên hệ thống.</p>
         </div>
         {/* Using container queries and aspect ratio for the video */}
         <div className="w-full aspect-[16/9] relative bg-[#0b1420]">
            <VideoTemplate />
         </div>
      </div>
    </AppLayout>
  );
}
