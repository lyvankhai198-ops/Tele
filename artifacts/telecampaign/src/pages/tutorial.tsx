import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

type TutorialStep = {
  id: number;
  image: string;
  vi: string;
  en: string;
  focus: { left: string; top: string; size?: "sm" | "md" | "lg" };
};

const sceneDurationMs = 6_000;

const steps: TutorialStep[] = [
  {
    id: 1,
    image: "tutorial/step-01-login.jpg",
    vi: "Bước 1: Truy cập Tele Campaign và đăng ký tài khoản miễn phí.",
    en: "Step 1: Open Tele Campaign and register for a free account.",
    focus: { left: "50%", top: "60%", size: "lg" },
  },
  {
    id: 2,
    image: "tutorial/step-02-register.png",
    vi: "Bước 2: Nhập tên đăng nhập và mật khẩu, sau đó bấm Đăng ký.",
    en: "Step 2: Enter your username and password, then click Register.",
    focus: { left: "50%", top: "70%", size: "lg" },
  },
  {
    id: 3,
    image: "tutorial/step-03-telegram-accounts.png",
    vi: "Bước 3: Thêm tài khoản Telegram để bắt đầu sử dụng chiến dịch.",
    en: "Step 3: Add a Telegram account to start using campaigns.",
    focus: { left: "78%", top: "9%", size: "md" },
  },
  {
    id: 4,
    image: "tutorial/step-04-add-account.png",
    vi: "Bước 4: Nhập API ID, API Hash, số điện thoại Telegram và thiết lập giới hạn mỗi ngày, sau đó bấm Lưu.",
    en: "Step 4: Enter the API ID, API Hash, Telegram phone number, and daily limit, then click Save.",
    focus: { left: "50%", top: "69%", size: "lg" },
  },
  {
    id: 5,
    image: "tutorial/step-05-telegram-api-guide.png",
    vi: "Bước 5: Truy cập Telegram để lấy API ID và API Hash.",
    en: "Step 5: Open Telegram to get your API ID and API Hash.",
    focus: { left: "48%", top: "53%", size: "lg" },
  },
  {
    id: 6,
    image: "tutorial/step-06-forward-template.png",
    vi: "Bước 6: Tạo nội dung trong ‘Tin nhắn đã lưu’ trên Telegram, sau đó chọn tin nhắn này làm nội dung Forward cho Campaign.",
    en: "Step 6: Create your content in Telegram’s ‘Saved Messages’, then select it as the forwarded message for your campaign.",
    focus: { left: "50%", top: "61%", size: "lg" },
  },
  {
    id: 7,
    image: "tutorial/step-07-campaigns.png",
    vi: "Bước 7: Vào mục Chiến dịch và bấm Tạo chiến dịch.",
    en: "Step 7: Open Campaigns and click Create Campaign.",
    focus: { left: "78%", top: "10%", size: "md" },
  },
  {
    id: 8,
    image: "tutorial/step-08-campaign-form.png",
    vi: "Bước 8: Đặt tên chiến dịch, chọn tài khoản Telegram, mẫu tin và nhóm gửi. Sau đó thiết lập số lần lặp và thời gian delay.",
    en: "Step 8: Name the campaign, select the Telegram account, message template, and target groups. Then set the number of loops and delay time.",
    focus: { left: "50%", top: "53%", size: "lg" },
  },
  {
    id: 9,
    image: "tutorial/step-09-campaign-delays.png",
    vi: "Bước 9: Thiết lập số lần lặp để xác định số lần Campaign gửi tin nhắn. Sau đó cài đặt thời gian delay giữa các vòng lặp.",
    en: "Step 9: Set the number of loops to determine how many times the campaign sends the message. Then configure the delay between loops.",
    focus: { left: "50%", top: "86%", size: "lg" },
  },
  {
    id: 10,
    image: "tutorial/step-10-activity-log.png",
    vi: "Bước 10: Kiểm tra Nhật ký hoạt động để theo dõi trạng thái và kết quả của chiến dịch.",
    en: "Step 10: Check the Activity Log to monitor the campaign status and results.",
    focus: { left: "78%", top: "61%", size: "md" },
  },
];

function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path}`;
}

export default function TutorialPage() {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const tick = (now: number) => {
      const previousFrame = previousFrameRef.current ?? now;
      previousFrameRef.current = now;
      progressRef.current += (now - previousFrame) / sceneDurationMs;

      if (progressRef.current >= 1) {
        if (currentScene === steps.length - 1) {
          progressRef.current = 1;
          setSceneProgress(1);
          setIsPlaying(false);
          return;
        }
        progressRef.current = 0;
        previousFrameRef.current = now;
        setCurrentScene((scene) => scene + 1);
      }

      setSceneProgress(progressRef.current);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      previousFrameRef.current = null;
    };
  }, [currentScene, isPlaying]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const goToScene = (scene: number, keepPlaying = isPlaying) => {
    const nextScene = Math.max(0, Math.min(scene, steps.length - 1));
    progressRef.current = 0;
    previousFrameRef.current = null;
    setSceneProgress(0);
    setCurrentScene(nextScene);
    setIsPlaying(keepPlaying);
  };

  const togglePlay = () => {
    if (currentScene === steps.length - 1 && sceneProgress >= 1) {
      goToScene(0, true);
      return;
    }
    setIsPlaying((playing) => !playing);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await playerRef.current?.requestFullscreen();
  };

  const step = steps[currentScene];
  const focusSize = step.focus.size === "sm" ? "h-8 w-8" : step.focus.size === "lg" ? "h-16 w-16" : "h-11 w-11";

  return (
    <AppLayout activePage="tutorial" title="Tutorial" subtitle="TeleCampaign · 10 steps">
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#1a2b88]">TeleCampaign walkthrough</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[#0f172a] sm:text-2xl">Hướng dẫn chiến dịch từ Bước 1 đến Bước 10</h2>
          <p className="mt-2 text-sm font-medium text-[#64748b]">Không có giọng nói · Phụ đề Việt + English · Video tutorial</p>
        </div>

        <div
          ref={playerRef}
          className={`flex items-center justify-center ${isFullscreen ? "h-screen w-screen bg-[#091224] p-3 sm:p-6" : "w-full"}`}
        >
          <div className={`relative flex aspect-[9/16] w-full max-w-[430px] flex-col overflow-hidden bg-[#0b1420] shadow-[0_24px_80px_rgba(15,23,42,.28)] ${isFullscreen ? "max-h-full rounded-[28px]" : "rounded-[30px] border-4 border-[#0f1d34]"}`}>
            <div className="absolute inset-x-0 top-0 z-30 px-4 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#1a2b88] px-3 py-1.5 text-[10px] font-black tracking-[0.14em] text-white shadow-lg">
                  STEP {String(step.id).padStart(2, "0")}
                </span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-[#1a2b88]">
                  {step.id} / {steps.length}
                </span>
              </div>
              <div className="mt-3 flex gap-1">
                {steps.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToScene(index)}
                    aria-label={`Go to step ${item.id}`}
                    className="group h-1.5 flex-1 overflow-hidden rounded-full bg-white/30"
                  >
                    <span
                      className="block h-full bg-white transition-[width] duration-100"
                      style={{ width: `${index < currentScene ? 100 : index === currentScene ? sceneProgress * 100 : 0}%` }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_20%_0%,#2b4475,transparent_45%),#111b2e] px-3 pb-2 pt-16">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, scale: 1.035, clipPath: "inset(0 0 100% 0 round 16px)" }}
                  animate={{ opacity: 1, scale: 1, clipPath: "inset(0 0 0% 0 round 16px)" }}
                  exit={{ opacity: 0, scale: 0.985, clipPath: "inset(100% 0 0 0 round 16px)" }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  className="relative h-full max-w-full aspect-[1290/2796]"
                >
                  <motion.img
                    src={assetUrl(step.image)}
                    alt={`TeleCampaign tutorial step ${step.id}`}
                    className="h-full w-full rounded-2xl object-contain shadow-[0_16px_34px_rgba(0,0,0,.24)]"
                    animate={{ scale: [1, 1.018, 1.01] }}
                    transition={{ duration: sceneDurationMs / 1000, ease: "linear" }}
                  />
                  <motion.span
                    aria-hidden="true"
                    className={`pointer-events-none absolute ${focusSize} -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2d8cff]/20 shadow-[0_0_0_5px_rgba(45,140,255,.22),0_0_28px_rgba(45,140,255,.9)]`}
                    style={{ left: step.focus.left, top: step.focus.top }}
                    animate={{ scale: [0.8, 1.18, 0.8], opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.65, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <span className="absolute inset-[35%] rounded-full bg-white shadow-sm" />
                  </motion.span>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#101b30] px-5 pb-3 pt-3.5">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                >
                  <p className="text-[12px] font-bold leading-5 text-white">{step.vi}</p>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-[#b8c7df]">{step.en}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex h-14 shrink-0 items-center justify-between border-t border-white/10 bg-[#0b1420] px-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToScene(currentScene - 1)}
                  disabled={currentScene === 0}
                  aria-label="Previous step"
                  className="grid h-9 w-9 place-items-center rounded-xl text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause tutorial" : "Play tutorial"}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#0b1420] transition hover:scale-105 active:scale-95"
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={() => goToScene(currentScene + 1)}
                  disabled={currentScene === steps.length - 1}
                  aria-label="Next step"
                  className="grid h-9 w-9 place-items-center rounded-xl text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="grid h-9 w-9 place-items-center rounded-xl text-white transition hover:bg-white/10"
              >
                {isFullscreen ? <X className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </div>

        <p className="max-w-md text-center text-xs leading-5 text-[#64748b]">Ảnh trong hướng dẫn sử dụng dữ liệu mẫu; thông tin API và số điện thoại đã được che hoặc thay thế.</p>
      </section>
    </AppLayout>
  );
}