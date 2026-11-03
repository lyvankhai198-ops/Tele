export const campaignGuidance = {
  vi: {
    name: "Đặt tùy ý để bạn dễ nhận biết, không gửi tên này vào nhóm.",
    account: "Chọn tài khoản Telegram đã kết nối để gửi tin và xem các nhóm của tài khoản đó.",
    template: "Chọn mẫu chứa nội dung sẽ gửi. Mẫu forward cần dùng đúng tài khoản nguồn.",
    text: "Đây là nội dung khách trong các nhóm đã chọn sẽ nhận được.",
    saved: "Chọn tin của tài khoản đang dùng; hệ thống sẽ forward tin này đến các nhóm đã chọn.",
    destinations: "Chọn ít nhất một nhóm mà tài khoản có quyền đăng; tin sẽ được gửi lần lượt đến từng nhóm.",
    repeat: "Mỗi vòng gửi qua danh sách nhóm đã chọn. Nên đặt 300 để tránh chiến dịch hết vòng sớm.",
    delayMin: "Thời gian chờ ngắn nhất giữa hai lượt gửi liên tiếp. Ví dụ: 3600 giây = 1 giờ.",
    delayMax: "Thời gian chờ dài nhất, phải bằng hoặc lớn hơn Min. Đặt bằng Min để gửi cách đều; đặt khác Min để khoảng chờ ngẫu nhiên trong mức bạn chọn.",
    schedule: "Chọn gửi ngay hoặc hẹn ngày, giờ bắt đầu. Đây là thời điểm dự kiến, không phải giờ gửi của từng nhóm.",
    dateOptional: "Để trống ngày nếu không hẹn lịch.",
    dateRequired: "Chọn ngày bắt đầu theo ngày, giờ trên thiết bị của bạn.",
    timeOptional: "Dùng giờ trên thiết bị của bạn; bỏ trống giờ sẽ dùng 00:00.",
    timeRequired: "Chọn giờ bắt đầu theo giờ trên thiết bị của bạn.",
    examplesTitle: "Xem ví dụ cài đặt",
    fixed: "Cách đều: đặt Min = Max (đơn vị giây).",
    interval: "Khoảng chờ",
    everyHour: (hours: number) => `${hours} giờ`,
    min: "Min (giây)",
    max: "Max (giây)",
    random: "Ngẫu nhiên khoảng 3–5 giờ/lượt: Min 10800, Max 18000.",
    sequence: "Chọn A/B/C và delay 1 giờ: gửi A → chờ khoảng 1 giờ → B → chờ khoảng 1 giờ → C. Không phải gửi hết các nhóm rồi mới chờ.",
    caveat: "Các ví dụ là khoảng chờ dự kiến, không đảm bảo chính xác giờ hoặc số bài/ngày. Giới hạn Telegram, mất kết nối và thời gian xử lý có thể làm chậm.",
  },
  en: {
    name: "Choose any name that helps you identify the campaign. This name is not sent to groups.",
    account: "Choose a connected Telegram account to send messages and view that account’s groups.",
    template: "Choose the template containing your message. Forward templates require their original source account.",
    text: "This is the message that members of your selected groups will receive.",
    saved: "Choose a message from the selected account; it will be forwarded to your selected groups.",
    destinations: "Choose at least one group where the account can post. Messages are sent to each group in turn.",
    repeat: "Each round goes through the selected group list. Use 300 to reduce early completion from running out of rounds.",
    delayMin: "The shortest wait between two consecutive sends. For example: 3600 seconds = 1 hour.",
    delayMax: "The longest wait; it must be at least Min. Set it equal to Min for even spacing, or higher for a random wait within your chosen range.",
    schedule: "Send now or choose a start date and time. This is the planned start, not a separate send time for every group.",
    dateOptional: "Leave the date blank if you do not want to schedule a start.",
    dateRequired: "Choose the start date using your device’s local date and time.",
    timeOptional: "Uses your device’s local time; a blank time defaults to 00:00.",
    timeRequired: "Choose the start time using your device’s local time.",
    examplesTitle: "View setup examples",
    fixed: "Even spacing: set Min = Max (in seconds).",
    interval: "Wait",
    everyHour: (hours: number) => `${hours} hour${hours === 1 ? "" : "s"}`,
    min: "Min (sec)",
    max: "Max (sec)",
    random: "Randomly about 3–5 hours per send: Min 10800, Max 18000.",
    sequence: "With A/B/C and a 1-hour delay: send to A → wait about 1 hour → B → wait about 1 hour → C. The wait is not only after sending to all groups.",
    caveat: "These are planned waits, not guaranteed send times or posts per day. Telegram limits, disconnections and processing can cause delays.",
  },
} as const;

export type CampaignGuidanceField = "name" | "account" | "template" | "text" | "saved" | "destinations" | "repeat" |
  "delayMin" | "delayMax" | "schedule" | "dateOptional" | "dateRequired" | "timeOptional" | "timeRequired";
export function CampaignFieldNote({ language, field, id, emphasis = false }: {
  language: "vi" | "en"; field: CampaignGuidanceField; id?: string; emphasis?: boolean;
}) {
  return <span id={id} role="note" data-guidance={field} className={`mt-1.5 block text-[12px] font-medium leading-relaxed ${emphasis ? "text-[#b45309]" : "text-[#64748b]"}`}>
    {campaignGuidance[language][field]}
  </span>;
}

export function DelayExamples({ language }: { language: "vi" | "en" }) {
  const text = campaignGuidance[language];
  return <details className="mt-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 text-[12px] text-[#475569]" data-testid="campaign-delay-examples">
    <summary className="cursor-pointer rounded-lg py-3 font-bold text-[#1d3bb8] outline-none focus-visible:ring-2 focus-visible:ring-[#1d3bb8]">{text.examplesTitle}</summary>
    <div className="space-y-3 pb-3.5 leading-relaxed">
      <p>{text.fixed}</p>
      <table className="w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">{text.fixed}</caption>
        <thead><tr className="border-b border-[#e2e8f0]"><th scope="col" className="py-1.5 font-bold">{text.interval}</th><th scope="col" className="py-1.5 font-bold">{text.min}</th><th scope="col" className="py-1.5 font-bold">{text.max}</th></tr></thead>
        <tbody>{[1, 2, 4, 6, 8, 12, 24].map(hours => <tr key={hours} className="border-b border-[#e2e8f0]/70 last:border-0"><th scope="row" className="py-1.5 font-medium">{text.everyHour(hours)}</th><td className="py-1.5">{hours * 3600}</td><td className="py-1.5">{hours * 3600}</td></tr>)}</tbody>
      </table>
      <p>{text.random}</p>
      <p>{text.sequence}</p>
      <p className="text-[#64748b]">{text.caveat}</p>
    </div>
  </details>;
}
