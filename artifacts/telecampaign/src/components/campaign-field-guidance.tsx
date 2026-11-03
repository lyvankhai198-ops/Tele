export const campaignGuidance = {
  vi: {
    name: "Đặt tùy ý để bạn dễ nhận biết, không gửi tên này vào nhóm.",
    account: "Chọn tài khoản Telegram đã kết nối để gửi tin và xem các nhóm của tài khoản đó.",
    template: "Chọn mẫu chứa nội dung sẽ gửi. Mẫu forward cần dùng đúng tài khoản nguồn.",
    text: "Đây là nội dung khách trong các nhóm đã chọn sẽ nhận được.",
    saved: "Chọn tin của tài khoản đang dùng; hệ thống sẽ forward tin này đến các nhóm đã chọn.",
    destinations: "Chọn các nhóm có quyền đăng. Mỗi vòng sẽ gửi đến các nhóm này theo khoảng cách bạn đặt.",
    repeat: "Mỗi vòng gửi qua danh sách nhóm đã chọn. Nên đặt 300 để tránh chiến dịch hết vòng sớm.",
    delayMin: "Chờ tối thiểu sau khi gửi xong một vòng rồi mới bắt đầu vòng tiếp theo. 3600 giây = 1 giờ.",
    delayMax: "Chờ tối đa giữa các vòng, phải bằng hoặc lớn hơn Min. Min = Max để chờ cố định; khác nhau để chờ ngẫu nhiên trong khoảng đã chọn.",
    groupIntervalLabel: "Khoảng cách giữa các nhóm (phút)",
    groupInterval: "Thời gian từ nhóm này đến nhóm tiếp theo trong cùng vòng. Ví dụ 5 hoặc 10 phút. Để 0 để lên lịch các nhóm cùng đợt; không thay thế Delay Min/Max.",
    fiveGroupWarning: "Nên dùng dưới 5 nhóm cho mỗi chiến dịch để dễ quản lý. Bạn vẫn có thể tiếp tục với số nhóm đã chọn.",
    legacyWarning: "Chiến dịch này dùng cách tính delay cũ. Khi lưu, phần lịch được tạo lại sẽ áp dụng chờ giữa các vòng và khoảng cách nhóm riêng.",
    schedule: "Chọn gửi ngay hoặc hẹn ngày, giờ bắt đầu. Đây là thời điểm dự kiến, không phải giờ gửi của từng nhóm.",
    dateOptional: "Để trống ngày nếu không hẹn lịch.",
    dateRequired: "Chọn ngày bắt đầu theo ngày, giờ trên thiết bị của bạn.",
    timeOptional: "Dùng giờ trên thiết bị của bạn; bỏ trống giờ sẽ dùng 00:00.",
    timeRequired: "Chọn giờ bắt đầu theo giờ trên thiết bị của bạn.",
    examplesTitle: "Xem ví dụ cài đặt",
    fixed: "Chờ cố định giữa các vòng: đặt Min = Max (đơn vị giây).",
    interval: "Khoảng chờ",
    everyHour: (hours: number) => `${hours} giờ`,
    min: "Min (giây)",
    max: "Max (giây)",
    random: "Chờ ngẫu nhiên 3–5 giờ sau mỗi vòng: Min 10800, Max 18000.",
    sequence: "Ví dụ Min = Max = 3600, khoảng cách nhóm 5 phút: A 08:00 → B 08:05 → C 08:10; gửi xong vòng này, chờ 1 giờ → A 09:10 ở vòng tiếp theo. Khoảng cách nhóm bằng 0: các nhóm được lên lịch cùng đợt.",
    caveat: "Các ví dụ là khoảng chờ dự kiến, không đảm bảo chính xác giờ hoặc số bài/ngày. Giới hạn Telegram, mất kết nối và thời gian xử lý có thể làm chậm.",
  },
  en: {
    name: "Choose any name that helps you identify the campaign. This name is not sent to groups.",
    account: "Choose a connected Telegram account to send messages and view that account’s groups.",
    template: "Choose the template containing your message. Forward templates require their original source account.",
    text: "This is the message that members of your selected groups will receive.",
    saved: "Choose a message from the selected account; it will be forwarded to your selected groups.",
    destinations: "Choose groups where the account can post. Each round covers these groups using your chosen group spacing.",
    repeat: "Each round goes through the selected group list. Use 300 to reduce early completion from running out of rounds.",
    delayMin: "The shortest wait after completing a round before starting the next round. 3600 seconds = 1 hour.",
    delayMax: "The longest wait between rounds; it must be at least Min. Equal values give a fixed wait; different values give a random wait within the range.",
    groupIntervalLabel: "Spacing between groups (minutes)",
    groupInterval: "Wait from one group to the next within the same round, for example 5 or 10 minutes. Use 0 to schedule groups in the same batch; this does not replace Delay Min/Max.",
    fiveGroupWarning: "Use fewer than 5 groups per campaign for easier management. You can still continue with your selected groups.",
    legacyWarning: "This campaign uses legacy delay rules. Saving will apply separate round waits and group spacing to the rebuilt schedule.",
    schedule: "Send now or choose a start date and time. This is the planned start, not a separate send time for every group.",
    dateOptional: "Leave the date blank if you do not want to schedule a start.",
    dateRequired: "Choose the start date using your device’s local date and time.",
    timeOptional: "Uses your device’s local time; a blank time defaults to 00:00.",
    timeRequired: "Choose the start time using your device’s local time.",
    examplesTitle: "View setup examples",
    fixed: "Fixed wait between rounds: set Min = Max (in seconds).",
    interval: "Wait",
    everyHour: (hours: number) => `${hours} hour${hours === 1 ? "" : "s"}`,
    min: "Min (sec)",
    max: "Max (sec)",
    random: "Wait randomly 3–5 hours after each round: Min 10800, Max 18000.",
    sequence: "Example Min = Max = 3600 with 5-minute group spacing: A 08:00 → B 08:05 → C 08:10; after completing this round, wait 1 hour → A 09:10 in the next round. With group spacing 0, groups are scheduled in the same batch.",
    caveat: "These are planned waits, not guaranteed send times or posts per day. Telegram limits, disconnections and processing can cause delays.",
  },
} as const;

export type CampaignGuidanceField = "name" | "account" | "template" | "text" | "saved" | "destinations" | "repeat" |
  "delayMin" | "delayMax" | "groupInterval" | "legacyWarning" | "schedule" | "dateOptional" | "dateRequired" | "timeOptional" | "timeRequired";
export function CampaignFieldNote({ language, field, id, emphasis = false }: {
  language: "vi" | "en"; field: CampaignGuidanceField; id?: string; emphasis?: boolean;
}) {
  return <span id={id} role="note" data-guidance={field} className={`mt-1.5 block text-[12px] font-medium leading-relaxed ${emphasis ? "text-[#b45309]" : "text-[#64748b]"}`}>
    {campaignGuidance[language][field]}
  </span>;
}

export function CampaignGroupInterval({ language, value, onChange, id = "campaign-group-interval" }: {
  language: "vi" | "en"; value: string; onChange: (value: string) => void; id?: string;
}) {
  return <label className="block">
    <span className="mb-1.5 block text-[13px] font-bold text-[#334155]">{campaignGuidance[language].groupIntervalLabel}</span>
    <input type="number" min="0" max="4320" step="1" value={value}
      onChange={event => onChange(event.target.value)} aria-describedby={`${id}-note`} data-testid={id}
      className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
    <CampaignFieldNote language={language} field="groupInterval" id={`${id}-note`} />
  </label>;
}

export function GroupCountRecommendation({ language, count }: { language: "vi" | "en"; count: number }) {
  if (count < 5) return null;
  return <p role="note" data-testid="campaign-group-recommendation"
    className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium leading-relaxed text-amber-800">
    {campaignGuidance[language].fiveGroupWarning}
  </p>;
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
