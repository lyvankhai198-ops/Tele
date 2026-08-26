import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "vi" | "en";

/** Vietnamese translations keyed by the English source string. */
const translations: Record<string, string> = {
  "Groups": "Nhóm",
  "Account": "Tài khoản",
  "Telegram Accounts": "Tài khoản Telegram",
  "Message templates": "Mẫu tin nhắn",
  "Proxy": "Proxy",
  "Logs": "Nhật ký",
  "Language": "Ngôn ngữ",
  "Upgrade": "Nâng cấp",
  "Dashboard": "Bảng điều khiển",
  "Operations console": "Bảng điều hành",
  "Workspace": "Không gian làm việc",
  "Control": "Điều khiển",
  "Overview": "Tổng quan",
  "Accounts": "Tài khoản",
  "Groups & channels": "Nhóm & kênh",
  "Campaigns": "Chiến dịch",
  "Calendar": "Lịch đăng",
  "Activity log": "Nhật ký hoạt động",
  "Settings": "Cài đặt",
  "Help center": "Trung tâm trợ giúp",
  "System status": "Trạng thái hệ thống",
  "All services operational": "Tất cả dịch vụ đang hoạt động",
  "Checked 2 min ago": "Đã kiểm tra 2 phút trước",
  "Community ops": "Vận hành cộng đồng",
  "Good morning, Minh": "Chào buổi sáng, Minh",
  "The control room is quiet.": "Trung tâm điều hành đang yên ắng.",
  "Keep approved conversations moving without losing the human signal. Here's what needs your attention today.": "Giữ các cuộc trò chuyện đã duyệt luôn hoạt động mà không đánh mất sự kết nối con người. Đây là những việc cần bạn chú ý hôm nay.",
  "Open calendar": "Mở lịch",
  "Create campaign": "Tạo chiến dịch",
  "Messages delivered": "Tin nhắn đã gửi",
  "today": "hôm nay",
  "need review": "cần duyệt",
  "total": "tổng",
  "Type": "Loại",
  "members": "thành viên",
  "of": "trên",
  "approved destinations": "điểm đến đã duyệt",
  "Calendar view opened": "Đã mở lịch",
  "Health checks are up to date": "Tình trạng đã được cập nhật",
  "Security policy copied to clipboard": "Đã sao chép chính sách bảo mật",
  "Destination sync started": "Đã bắt đầu đồng bộ điểm đến",
  "Telegram integration is not configured. Configure TELEGRAM_API_ID and TELEGRAM_API_HASH to connect an account.": "Tích hợp Telegram chưa được cấu hình. Hãy cấu hình TELEGRAM_API_ID và TELEGRAM_API_HASH để kết nối tài khoản.",
  "Posting permission updated": "Đã cập nhật quyền đăng bài",
  "Showing": "Hiển thị",
  "plans across your approved destinations": "kế hoạch trên các điểm đến đã duyệt",
  "posts": "bài đăng",
  "Created by": "Tạo bởi",
  "destinations": "điểm đến",
  "Resume campaign": "Tiếp tục chiến dịch",
  "Pause campaign": "Tạm dừng chiến dịch",
  "No campaigns in this state.": "Không có chiến dịch ở trạng thái này.",
  "Calendar settings": "Cài đặt lịch",
  "Calendar synced with workspace timezone ICT": "Lịch đã đồng bộ theo múi giờ ICT của không gian làm việc",
  "Month view is ready for the next release": "Chế độ xem tháng sẽ có trong bản phát hành tiếp theo",
  "Filters opened": "Đã mở bộ lọc",
  "Previous week": "Tuần trước",
  "Next week": "Tuần sau",
  "Filter calendar": "Lọc lịch",
  "Capacity": "Sức chứa",
  "Activity export prepared": "Đã chuẩn bị bản xuất hoạt động",
  "Activity export prepared as CSV": "Đã chuẩn bị hoạt động dạng CSV",
  "Filter activity": "Lọc hoạt động",
  "events": "sự kiện",
  "Settings saved": "Đã lưu cài đặt",
  "Last sign-in today": "Lần đăng nhập cuối hôm nay",
  "Session timeout options opened": "Đã mở tùy chọn hết phiên",
  "Email destination editing opened": "Đã mở chỉnh sửa email nhận thông báo",
  "All other sessions revoked": "Đã thu hồi các phiên khác",
  "Integration status refresh requested": "Đã yêu cầu làm mới trạng thái tích hợp",
  "and": "và",
  "to connect an account.": "để kết nối tài khoản.",
  "These values belong in your server environment. Never paste them, a session string, password, or verification code into the browser.": "Các giá trị này thuộc môi trường máy chủ. Không bao giờ dán chúng, session string, mật khẩu hoặc mã xác minh vào trình duyệt.",
  "Add API credentials to the server environment, not the client.": "Thêm thông tin API vào môi trường máy chủ, không phải phía client.",
  "Connect only identities you are authorized to operate.": "Chỉ kết nối những danh tính bạn được phép vận hành.",
  "Review posting permission for every destination before scheduling.": "Kiểm tra quyền đăng của từng điểm đến trước khi lên lịch.",
  "Scheduled next": "Sắp đăng tiếp theo",
  "Active channels": "Kênh đang hoạt động",
  "Delivery rate": "Tỷ lệ gửi thành công",
  "Tuesday, 14 January 2025 · Workspace timezone ICT": "Thứ Ba, 14 tháng 1 năm 2025 · Múi giờ không gian làm việc ICT",
  "Managed identities and connection health": "Danh tính đang quản lý và tình trạng kết nối",
  "Approved destinations and posting access": "Điểm đến đã duyệt và quyền đăng bài",
  "Approved content, destinations, and schedules": "Nội dung đã duyệt, điểm đến và lịch đăng",
  "An audit-friendly record of every workspace action": "Bản ghi dễ kiểm tra của mọi thao tác trong không gian làm việc",
  "A shared view of scheduled, reviewed content": "Chế độ xem chung cho nội dung đã lên lịch và kiểm tra",
  "Workspace preferences and secure integration controls": "Tùy chọn không gian và kiểm soát tích hợp an toàn",
  "Last check": "Lần kiểm tra cuối",
  "Attention": "Cần chú ý",
  "Connected": "Đã kết nối",
  "Open": "Trống",
  "Configure": "Cấu hình",
  "Throughput": "Lưu lượng",
  "Delivery overview": "Tổng quan gửi bài",
  "Successful posts across managed channels": "Bài đăng thành công trên các kênh đang quản lý",
  "Last 7 days": "7 ngày qua",
  "Last 30 days": "30 ngày qua",
  "This quarter": "Quý này",
  "Posts delivered": "Bài đã gửi",
  "Delivered": "Đã gửi",
  "Pending review": "Chờ duyệt",
  "Guardrails": "Kiểm soát an toàn",
  "Workspace health": "Tình trạng không gian làm việc",
  "Live checks for your Telegram connection": "Kiểm tra trực tiếp kết nối Telegram",
  "Operating normally": "Đang hoạt động bình thường",
  "No permission or delivery issues": "Không có lỗi quyền hạn hoặc gửi bài",
  "Telegram connection": "Kết nối Telegram",
  "Posting permissions": "Quyền đăng bài",
  "Review queue": "Hàng đợi cần duyệt",
  "Connected · 4 accounts": "Đã kết nối · 4 tài khoản",
  "12 of 12 verified": "Đã xác minh 12/12",
  "2 items waiting": "2 mục đang chờ",
  "Clear": "Ổn định",
  "Review": "Cần duyệt",
  "Run health check": "Kiểm tra tình trạng",
  "Queue": "Hàng đợi",
  "Upcoming posts": "Bài đăng sắp tới",
  "Next approved content in your publishing queue": "Nội dung đã duyệt tiếp theo trong hàng đợi đăng bài",
  "See calendar": "Xem lịch",
  "Scheduled": "Đã lên lịch",
  "Draft": "Bản nháp",
  "Signal": "Tín hiệu",
  "Channel health": "Tình trạng kênh",
  "Recent activity by destination": "Hoạt động gần đây theo điểm đến",
  "Manage destinations": "Quản lý điểm đến",
  "Identity & access": "Danh tính & quyền truy cập",
  "Telegram accounts": "Tài khoản Telegram",
  "Connect only accounts you already manage. TeleCampaign never requests or stores a login code in this workspace.": "Chỉ kết nối những tài khoản bạn đang quản lý. TeleCampaign không bao giờ yêu cầu hoặc lưu mã đăng nhập trong không gian làm việc này.",
  "Add account": "Thêm tài khoản",
  "Add Telegram account": "Thêm tài khoản Telegram",
  "Permission-first by default": "Ưu tiên quyền hạn ngay từ đầu",
  "Each account is scoped to the channels you explicitly approve. No auto-join, discovery, or unsolicited messaging actions are available.": "Mỗi tài khoản chỉ được giới hạn trong các kênh bạn phê duyệt rõ ràng. Không có chức năng tự tham gia, tự khám phá hoặc gửi tin ngoài mong muốn.",
  "View policy": "Xem chính sách",
  "Connected identities": "Danh tính đã kết nối",
  "Approved destinations": "Điểm đến đã duyệt",
  "Across all accounts": "Trên tất cả tài khoản",
  "Connection uptime": "Thời gian kết nối",
  "Managed identities": "Danh tính đang quản lý",
  "Connected accounts": "Tài khoản đã kết nối",
  "Use a separate identity when a team or community requires it.": "Dùng danh tính riêng khi đội nhóm hoặc cộng đồng yêu cầu.",
  "Add a Telegram account": "Thêm tài khoản Telegram",
  "Account ready to connect": "Tài khoản sẵn sàng kết nối",
  "Use Telegram's official sign-in flow. We will never ask you to paste a session string or verification code here.": "Sử dụng quy trình đăng nhập chính thức của Telegram. Chúng tôi sẽ không bao giờ yêu cầu bạn dán session string hoặc mã xác minh vào đây.",
  "Your integration settings are present. Continue only if this identity is yours to operate.": "Cấu hình tích hợp đã sẵn sàng. Chỉ tiếp tục nếu bạn có quyền vận hành danh tính này.",
  "Safe connection flow": "Quy trình kết nối an toàn",
  "Telegram will open a separate authentication step. Never share a code with anyone, including support.": "Telegram sẽ mở một bước xác thực riêng. Không chia sẻ mã với bất kỳ ai, kể cả bộ phận hỗ trợ.",
  "Phone number (optional)": "Số điện thoại (không bắt buộc)",
  "Cancel": "Hủy",
  "Continue securely": "Tiếp tục an toàn",
  "Telegram integration": "Tích hợp Telegram",
  "Ready for account authorization": "Sẵn sàng xác thực tài khoản",
  "After authorization, you can review destination permissions before any post is scheduled.": "Sau khi xác thực, bạn có thể kiểm tra quyền của từng điểm đến trước khi lên lịch đăng bài.",
  "Back": "Quay lại",
  "Connect account": "Kết nối tài khoản",
  "Destinations": "Điểm đến",
  "Sync destinations": "Đồng bộ điểm đến",
  "A clear boundary around where your team can publish. Review every destination before adding it to a campaign.": "Ranh giới rõ ràng cho nơi đội nhóm được phép đăng. Kiểm tra từng điểm đến trước khi thêm vào chiến dịch.",
  "Discover managed groups": "Tìm nhóm đang quản lý",
  "Search groups, channels, or handles": "Tìm nhóm, kênh hoặc username",
  "All destinations": "Tất cả điểm đến",
  "Group": "Nhóm",
  "Channel": "Kênh",
  "Destination": "Điểm đến",
  "Managed by": "Người quản lý",
  "Posts": "Bài đăng",
  "Posting permission": "Quyền đăng bài",
  "Allowed": "Được phép",
  "Restricted": "Bị giới hạn",
  "No destinations match this search.": "Không có điểm đến phù hợp với tìm kiếm.",
  "Changes apply to new campaigns": "Thay đổi áp dụng cho chiến dịch mới",
  "Members": "Thành viên",
  "Posts sent": "Bài đã gửi",
  "Only users with explicit admin permission can publish here. TeleCampaign does not alter group membership.": "Chỉ người dùng có quyền quản trị rõ ràng mới được đăng tại đây. TeleCampaign không thay đổi thành viên nhóm.",
  "Update permission": "Cập nhật quyền",
  "Publishing workflow": "Quy trình đăng bài",
  "Build a clear publishing plan, check its scope, then schedule it. Drafts stay private until you choose a time.": "Tạo kế hoạch đăng rõ ràng, kiểm tra phạm vi rồi lên lịch. Bản nháp chỉ ở chế độ riêng tư cho đến khi bạn chọn thời gian.",
  "New campaign": "Chiến dịch mới",
  "Your workspace": "Không gian của bạn",
  "All campaigns": "Tất cả chiến dịch",
  "Scope": "Phạm vi",
  "Schedule": "Lịch đăng",
  "Campaign": "Chiến dịch",
  "Campaigns are limited to destinations where your account has explicit posting permission.": "Chiến dịch chỉ được đăng tại những điểm đến mà tài khoản có quyền đăng rõ ràng.",
  "Campaign saved as draft": "Đã lưu chiến dịch dưới dạng bản nháp",
  "Campaign resumed": "Đã tiếp tục chiến dịch",
  "Campaign paused": "Đã tạm dừng chiến dịch",
  "Campaign deleted": "Đã xóa chiến dịch",
  "e.g. February community check-in": "ví dụ: Cập nhật cộng đồng tháng Hai",
  "Continue": "Tiếp tục",
  "Untitled campaign": "Chiến dịch chưa đặt tên",
  "post per destination": "bài trên mỗi điểm đến",
  "This review confirms the destination scope. No message will be sent outside these selected channels.": "Bản kiểm tra này xác nhận phạm vi điểm đến. Không có tin nhắn nào được gửi ngoài các kênh đã chọn.",
  "Create a campaign": "Tạo chiến dịch",
  "A short review before anything can be scheduled.": "Kiểm tra nhanh trước khi lên lịch bất kỳ nội dung nào.",
  "Plan": "Kế hoạch",
  "Campaign name": "Tên chiến dịch",
  "Content format": "Định dạng nội dung",
  "Compose a post": "Soạn bài đăng",
  "Write or paste an approved message": "Viết hoặc dán nội dung đã duyệt",
  "Import a content set": "Nhập bộ nội dung",
  "Use an existing reviewed draft": "Dùng bản nháp đã kiểm tra",
  "Select only destinations where your connected account has posting permission.": "Chỉ chọn điểm đến mà tài khoản đã kết nối có quyền đăng bài.",
  "permission verified": "đã xác minh quyền",
  "Publish date": "Ngày đăng",
  "Publish time": "Giờ đăng",
  "Posts will use the workspace timezone": "Bài đăng sẽ dùng múi giờ của không gian làm việc",
  "You can pause or edit this campaign at any time before it runs.": "Bạn có thể tạm dừng hoặc chỉnh sửa chiến dịch bất cứ lúc nào trước khi chạy.",
  "Save campaign": "Lưu chiến dịch",
  "Delete this campaign?": "Xóa chiến dịch này?",
  "This removes the campaign and its schedule from the workspace. This action cannot be undone.": "Thao tác này sẽ xóa chiến dịch và lịch đăng khỏi không gian làm việc. Không thể hoàn tác.",
  "Keep campaign": "Giữ chiến dịch",
  "Delete campaign": "Xóa chiến dịch",
  "Publishing calendar": "Lịch đăng bài",
  "Schedule at a glance": "Lịch đăng tổng quan",
  "A quiet week is a good week. Every card below has a verified destination and an accountable owner.": "Một tuần yên ắng là một tuần tốt. Mỗi thẻ bên dưới đều có điểm đến đã xác minh và người phụ trách.",
  "Schedule a post": "Lên lịch bài đăng",
  "Today": "Hôm nay",
  "Week": "Tuần",
  "Month": "Tháng",
  "Needs review": "Cần xem xét",
  "Published": "Đã đăng",
  "All times in ICT (UTC+7)": "Tất cả thời gian theo ICT (UTC+7)",
  "Tuesday's run sheet": "Lịch chạy ngày thứ Ba",
  "Publishing windows": "Khung giờ đăng",
  "Healthy spacing between scheduled posts": "Khoảng cách giữa các bài đã lên lịch đang ổn",
  "scheduled posts": "bài đã lên lịch",
  "No overlapping windows or permission conflicts this week.": "Tuần này không có khung giờ trùng hoặc xung đột quyền hạn.",
  "Approved & scheduled": "Đã duyệt & lên lịch",
  "Edit schedule": "Sửa lịch",
  "Preview post": "Xem trước bài",
  "Traceability": "Khả năng truy vết",
  "See what happened, where it happened, and which managed identity performed the action. Logs are retained for 90 days.": "Xem điều gì đã xảy ra, ở đâu và danh tính nào đã thực hiện. Nhật ký được lưu trong 90 ngày.",
  "Export log": "Xuất nhật ký",
  "Export CSV": "Xuất CSV",
  "Successful actions": "Thao tác thành công",
  "Failures this month": "Lỗi trong tháng này",
  "Permission reviews": "Lần kiểm tra quyền",
  "Audit trail": "Dấu vết kiểm tra",
  "Recent activity": "Hoạt động gần đây",
  "Latest first · workspace timezone ICT": "Mới nhất trước · múi giờ ICT",
  "Search activity": "Tìm hoạt động",
  "All activity": "Tất cả hoạt động",
  "Success": "Thành công",
  "Failures": "Lỗi",
  "Understand what happened and why": "Theo dõi rõ điều gì đã xảy ra và lý do",
  "Clear records of deliveries, warnings, and account actions. Open any record to see its context and technical details.": "Theo dõi rõ lượt gửi, cảnh báo và thao tác tài khoản. Mở từng bản ghi để xem ngữ cảnh và thông tin chi tiết.",
  "Could not load activity. Refresh and try again.": "Không thể tải nhật ký. Hãy làm mới và thử lại.",
  "Context": "Ngữ cảnh",
  "Telegram username": "Tên người dùng Telegram",
  "Delivery details": "Chi tiết gửi",
  "Target status": "Trạng thái lượt gửi",
  "Attempts": "Số lần thử",
  "Next retry": "Lần thử lại tiếp theo",
  "Last error": "Lỗi gần nhất",
  "Technical information": "Thông tin kỹ thuật",
  "Action type": "Loại hoạt động",
  "Reference": "Mã tham chiếu",
  "No linked campaign": "Không gắn với chiến dịch",
  "No linked account": "Không gắn với tài khoản",
  "No linked destination": "Không gắn với điểm đến",
  "Campaign no longer available": "Chiến dịch không còn khả dụng",
  "Account no longer available": "Tài khoản không còn khả dụng",
  "Destination no longer available": "Điểm đến không còn khả dụng",
  "This record is not tied to a delivery target.": "Bản ghi này không gắn với một lượt gửi cụ thể.",
  "Retention: 90 days": "Lưu giữ: 90 ngày",
  "No activity matches this view.": "Không có hoạt động phù hợp với chế độ xem này.",
  "Workspace control": "Điều khiển không gian",
  "Keep the workspace aligned with your team's operating rhythm. Changes save locally in this preview.": "Giữ không gian làm việc đồng bộ với nhịp vận hành của đội nhóm. Thay đổi được lưu cục bộ trong bản xem trước này.",
  "Save changes": "Lưu thay đổi",
  "Workspace settings": "Cài đặt không gian",
  "Access policy": "Chính sách truy cập",
  "Your workspace is protected by least-privilege access and an auditable activity log.": "Không gian của bạn được bảo vệ bằng quyền tối thiểu cần thiết và nhật ký có thể kiểm tra.",
  "Two-factor authentication": "Xác thực hai yếu tố",
  "Required for all workspace owners and publishers.": "Bắt buộc với chủ sở hữu và người đăng bài.",
  "Session timeout": "Thời gian hết phiên",
  "Sign out after 30 minutes of inactivity.": "Đăng xuất sau 30 phút không hoạt động.",
  "Active sessions": "Phiên đang hoạt động",
  "Revoke all": "Thu hồi tất cả",
  "Profile": "Hồ sơ",
  "Account details": "Thông tin tài khoản",
  "The workspace owner shown in audit events.": "Chủ sở hữu không gian hiển thị trong các sự kiện kiểm tra.",
  "Full name": "Họ và tên",
  "Work email": "Email công việc",
  "Keep informed": "Luôn được cập nhật",
  "Choose which operational signals deserve your attention.": "Chọn những tín hiệu vận hành cần bạn chú ý.",
  "Delivery and permission alerts": "Cảnh báo gửi bài và quyền hạn",
  "Get notified when a post fails or a destination needs review.": "Nhận thông báo khi bài đăng lỗi hoặc điểm đến cần kiểm tra.",
  "Weekly workspace summary": "Tóm tắt không gian hàng tuần",
  "A Monday digest of delivery, reach, and pending reviews.": "Bản tóm tắt thứ Hai về việc gửi bài, độ phủ và các mục đang chờ duyệt.",
  "Notification destination": "Nơi nhận thông báo",
  "Change email": "Đổi email",
  "Telegram integration is not configured": "Tích hợp Telegram chưa được cấu hình",
  "Action needed": "Cần thực hiện",
  "Configure and to connect an account.": "Cấu hình để kết nối tài khoản.",
  "Before you connect": "Trước khi kết nối",
  "A safe checklist for your Telegram administrator.": "Danh sách kiểm tra an toàn cho quản trị viên Telegram.",
  "Configure integration": "Cấu hình tích hợp",
  "Integration guide": "Hướng dẫn tích hợp",
  "No credentials, session strings, passwords, or verification codes are shown here.": "Không có credential, session string, mật khẩu hoặc mã xác minh nào được hiển thị ở đây.",
  "Close": "Đóng",
  "Refresh status": "Làm mới trạng thái",
  "Revoke all active sessions?": "Thu hồi tất cả phiên đang hoạt động?",
  "This signs out every trusted device except the one you are using now. You can sign in again after confirmation.": "Thao tác này đăng xuất mọi thiết bị tin cậy ngoại trừ thiết bị bạn đang dùng. Bạn có thể đăng nhập lại sau khi xác nhận.",
  "Revoke sessions": "Thu hồi phiên",
  "Configure Telegram integration": "Cấu hình tích hợp Telegram",
  "Environment configuration is managed on your server. This screen intentionally never accepts or displays secret values.": "Cấu hình môi trường được quản lý trên máy chủ. Màn hình này cố ý không nhận hoặc hiển thị giá trị bí mật.",
  "server environment": "môi trường máy chủ",
  "Ask your administrator to add both values, then refresh the integration status.": "Yêu cầu quản trị viên thêm cả hai giá trị, sau đó làm mới trạng thái tích hợp.",
  "Telegram Bot purchase link": "Link mua key qua Telegram Bot",
  "This is the destination users open from the upgrade page to buy a license key.": "Đây là link người dùng sẽ mở từ trang nâng cấp để mua license key.",
  "Loading purchase link…": "Đang tải link mua key…",
  "Could not load the purchase-link setting. Refresh the page and try again.": "Không thể tải cấu hình link mua key. Hãy làm mới trang và thử lại.",
  "Telegram Bot URL": "Link Telegram Bot",
  "Save link": "Lưu link",
  "Saving…": "Đang lưu…",
  "Enter a Telegram Bot link before saving.": "Hãy nhập link Telegram Bot trước khi lưu.",
  "Telegram purchase link saved.": "Đã lưu link mua key Telegram.",
  "Could not save the Telegram purchase link.": "Không thể lưu link mua key Telegram.",
  "Only HTTPS links on t.me or telegram.me are accepted.": "Chỉ chấp nhận link HTTPS thuộc t.me hoặc telegram.me.",
  "No purchase link is configured. Users will be told to contact an administrator.": "Chưa cấu hình link mua key. Người dùng sẽ được yêu cầu liên hệ quản trị viên.",
  "Buy key": "Mua key",
  "Purchasing is not configured yet. Please contact an administrator to get a license key.": "Kênh mua key chưa được cấu hình. Vui lòng liên hệ quản trị viên để nhận license key.",
  // Auth / login shell
  "Telegram Campaign Manager": "Quản trị Chiến dịch Telegram",
  "Telegram Manager": "Quản trị Telegram",
  "Controlled campaign delivery": "Gửi chiến dịch có kiểm soát",
  "Sign in to securely manage your Telegram accounts and campaigns.": "Đăng nhập để quản lý an toàn tài khoản Telegram và các chiến dịch của riêng bạn.",
  "Checking…": "Đang kiểm tra...",
  "Go to dashboard": "Vào bảng điều khiển",
  "Sign in": "Đăng nhập",
  "Sign in to TeleCampaign": "Đăng nhập",
  "Enter your credentials to access the dashboard.": "Nhập tài khoản để vào bảng điều khiển Tele Campaign",
  "Username": "Tài khoản",
  "Username placeholder": "Tên đăng nhập",
  "Password": "Mật khẩu",
  "Password placeholder": "Nhập mật khẩu",
  "Signing in…": "Đang đăng nhập...",
  "No account yet? Register for free": "Chưa có tài khoản? Đăng ký miễn phí",
  "Register": "Đăng ký",
  "Create your account": "Đăng ký",
  "Create an account to use TeleCampaign.": "Tạo tài khoản để sử dụng Tele Campaign",
  "Confirm password": "Xác nhận mật khẩu",
  "Confirm password placeholder": "Nhập lại mật khẩu",
  "Passwords do not match": "Mật khẩu xác nhận không khớp",
  "Creating account…": "Đang tạo tài khoản...",
  "Already have an account? Sign in": "Đã có tài khoản? Đăng nhập",
  "Could not sign in. Please try again.": "Không thể đăng nhập. Vui lòng thử lại",
  "Could not register. Please try again.": "Không thể đăng ký. Vui lòng thử lại",
  "Could not connect to server. Please try again.": "Không thể kết nối máy chủ. Vui lòng thử lại",
  // Navigation / admin
  "Admin license keys": "Quản trị key",
  "Close sidebar": "Đóng",
  "Open menu": "Mở menu",
  "Sign out": "Đăng xuất",

  // ── dashboard.tsx ────────────────────────────────────────────
  "Loading data…": "Đang tải dữ liệu...",
  "Error loading data": "Lỗi tải dữ liệu",
  "Please try again later.": "Vui lòng thử lại sau.",
  "Active Groups": "Nhóm đang hoạt động",
  "Message Templates": "Mẫu tin nhắn",
  "Sent Today": "Đã gửi hôm nay",
  "Failed Today": "Thất bại hôm nay",
  "ADMIN Notifications": "THÔNG BÁO ADMIN",
  "Notification details": "Chi tiết thông báo",
  "Read the full announcement and its display settings.": "Xem đầy đủ nội dung và cài đặt hiển thị của thông báo.",
  "Preview": "Xem trước",
  "View notification details": "Xem chi tiết thông báo",
  "View now": "Xem ngay",
  "No English translation added yet.": "Chưa thêm bản dịch tiếng Anh.",
  "Update on": "Update ngày",
  "No notifications.": "Không có thông báo nào.",
  "Recent Campaigns": "Chiến dịch gần đây",
  "Name": "Tên",
  "Status": "Trạng thái",
  "No campaigns yet.": "Chưa có chiến dịch nào.",
  "Recent Activity": "Nhật ký gần đây",
  "Time": "Thời gian",
  "No activity yet.": "Chưa có hoạt động nào.",
  "Campaign (fallback)": "Chiến dịch",
  "System": "Hệ thống",
  "Failed": "Thất bại",

  // ── feature-placeholder.tsx ──────────────────────────────────
  "Coming soon": "Sắp ra mắt",
  "Message templates heading": "Mẫu tin nhắn",
  "Message templates detail": "Khu vực quản lý và tái sử dụng nội dung đã duyệt đang được hoàn thiện.",
  "Proxy detail": "Khu vực quản lý proxy an toàn cho tài khoản Telegram đang được hoàn thiện.",
  "Back to dashboard": "Về bảng điều khiển",

  // ── calendar.tsx ─────────────────────────────────────────────
  "Refresh calendar": "Làm mới lịch",
  "Every scheduled card below comes from the persistent campaign queue and can be paused from Campaigns.": "Mỗi thẻ lên lịch bên dưới đến từ hàng đợi chiến dịch và có thể tạm dừng từ Chiến dịch.",
  "Loading scheduled items…": "Đang tải lịch đăng...",
  "No scheduled campaigns in this week.": "Không có chiến dịch nào được lên lịch trong tuần này.",
  "Manage this campaign from Campaigns.": "Quản lý chiến dịch này từ trang Chiến dịch.",

  // ── logs.tsx ─────────────────────────────────────────────────
  "Refresh": "Làm mới",
  "Real server events are retained here without session strings, passwords, verification codes, or API secrets.": "Sự kiện máy chủ thực được lưu tại đây, không bao gồm session string, mật khẩu, mã xác minh hoặc bí mật API.",
  "Warnings": "Cảnh báo",
  "Latest first · workspace timezone": "Mới nhất trước · múi giờ không gian làm việc",
  "Reviews": "Cần duyệt",
  "Loading activity…": "Đang tải hoạt động...",
  "success": "Thành công",
  "error": "Lỗi",
  "warning": "Cảnh báo",
  "info": "Thông tin",

  // ── settings.tsx ─────────────────────────────────────────────
  "two-factor authentication": "xác thực hai yếu tố",
  "delivery and permission alerts": "cảnh báo gửi bài và quyền hạn",
  "weekly workspace summary": "tóm tắt không gian hàng tuần",
  "Security": "Bảo mật",
  "Notifications": "Thông báo",

  // ── upgrade.tsx ──────────────────────────────────────────────
  "Upgrade plan": "Nâng cấp gói dịch vụ",
  "Could not load plan information.": "Không thể tải thông tin gói.",
  "Expand account limits and unlock advanced campaign management features. Optimise workflow efficiency with priority systems.": "Mở rộng giới hạn tài khoản và mở khóa các tính năng quản trị chiến dịch nâng cao. Tối ưu hóa hiệu suất làm việc với hệ thống ưu tiên.",
  "Your current plan": "Gói hiện tại của bạn",
  "Active": "Đang hoạt động",
  "Expired": "Hết hạn",
  "Up to {n} accounts": "Tối đa {n} tài khoản",
  "Unlimited accounts": "Không giới hạn tài khoản",
  "No expiry": "Không thời hạn",
  "Expires: {date}": "Hết hạn: {date}",
  "Activate key / Change plan": "Kích hoạt key / Đổi gói",
  "Recommended": "Khuyên dùng",
  "Unlimited": "Không giới hạn",
  "accounts (abbrev)": "TK",
  "Valid for {n} days": "Thời hạn {n} ngày",
  "Current plan": "Đang sử dụng",
  "Already included": "Đã bao gồm",
  "Select this plan": "Chọn gói này",
  "Activate plan": "Kích hoạt gói",
  "Enter License Key": "Nhập License Key",
  "Processing…": "Đang xử lý...",
  "Activate key": "Kích hoạt mã",
  "Activation successful! Dashboard limits have been updated.": "Kích hoạt thành công! Bảng điều khiển đã được cập nhật giới hạn mới.",
  "Invalid or already used activation code.": "Mã kích hoạt không hợp lệ hoặc đã được sử dụng.",
  "Confirm plan selection": "Xác nhận chọn gói",
  "You have selected the {plan} plan. To complete the upgrade, enter the activation code for this plan.": "Bạn đã chọn gói {plan}. Để thực hiện nâng cấp, bạn cần nhập mã kích hoạt tương ứng với gói này.",
  "Proceed": "Tiếp tục",

  // ── not-found.tsx ────────────────────────────────────────────
  "404 Page Not Found": "404 Không tìm thấy trang",
  "Did you forget to add the page to the router?": "Bạn có quên thêm trang vào router không?",

  // ── upgrade plan features ────────────────────────────────────
  "Campaign management": "Quản lý chiến dịch",
  "Message templates (feature)": "Mẫu tin nhắn",
  "Activity log tracking": "Theo dõi nhật ký",
  "Automatic group sync": "Đồng bộ nhóm tự động",
  "Campaign automation": "Tự động hóa chiến dịch",
  "Technical support": "Hỗ trợ kỹ thuật",
  "Priority support": "Hỗ trợ ưu tiên",
  "Priority support 24/7": "Hỗ trợ ưu tiên 24/7",
};

/**
 * Server errors are not localized consistently. In English, always use the
 * caller's safe fallback instead of exposing an accidental Vietnamese message
 * (including unaccented Vietnamese). Vietnamese preserves the server detail.
 */
export function localizedErrorMessage(error: unknown, language: Language, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const cleanMessage = message.replace(/^HTTP \d{3} [^:]+:\s*/, "");
  return language === "vi" && cleanMessage ? cleanMessage : fallback;
}

/**
 * Delivery errors can come directly from Telegram and are usually written in
 * English. Keep the technical cause recognizable, but give customers a clear
 * next action in the language they selected.
 */
export function localizedDeliveryErrorMessage(error: unknown, language: Language, fallback: string): string {
  const message = typeof error === "string"
    ? error.trim()
    : error instanceof Error
      ? error.message.trim()
      : "";
  const cleanMessage = message.replace(/^HTTP \d{3} [^:]+:\s*/, "");

  if (/Daily user message limit(?: of \d+)? reached\. Campaign (?:paused (?:until you resume it|until resumed|and will resume automatically) on a new day|will resume automatically on a new day)\./i.test(cleanMessage)) {
    return language === "vi"
      ? "Đã đạt ngân sách gửi tổng trong ngày. Chiến dịch sẽ tự động chạy lại vào ngày mới."
      : "Your workspace reached its daily message budget and this campaign will resume automatically on a new day.";
  }
  if (/Daily message limit(?: of \d+)? reached\. Campaign (?:paused (?:until you resume it|until resumed|and will resume automatically) on a new day|will resume automatically on a new day)\./i.test(cleanMessage)) {
    return language === "vi"
      ? "Đã đạt giới hạn gửi của chiến dịch trong ngày. Chiến dịch sẽ tự động chạy lại vào ngày mới."
      : "This campaign reached its daily message limit and will resume automatically on a new day.";
  }

  if (/MESSAGE_ID_INVALID|saved Telegram message ID is invalid/i.test(cleanMessage)) {
    return language === "vi"
      ? "Lỗi tin nhắn nguồn: tin nhắn đã chọn để Forward đã bị thay đổi hoặc không còn tồn tại trong Tin nhắn đã lưu. Hệ thống đã làm mới tin nhắn này một lần nhưng không khôi phục được. Hãy chọn lại tin nhắn hiện tại. (Telegram: MESSAGE_ID_INVALID)"
      : "Source message error: the message selected for forwarding was changed or is no longer available in Saved Messages. The system refreshed this message once but could not recover it. Select the current message again. (Telegram: MESSAGE_ID_INVALID)";
  }

  const unavailableEntity = cleanMessage.match(/Telegram (?:entity for|destination) ["“](.+?)["”] is unavailable/i);
  if (unavailableEntity) {
    const destinationTitle = unavailableEntity[1];
    return language === "vi"
      ? `Lỗi điểm đến: không tìm thấy nhóm “${destinationTitle}” trên tài khoản Telegram đang chạy. Hệ thống không tự đồng bộ nhóm cho lỗi này. Hãy kiểm tra tài khoản vẫn còn trong nhóm trước khi thử lại.`
      : `Destination error: the group “${destinationTitle}” is not available to the Telegram account running this campaign. The system does not automatically sync groups for this error. Make sure the account is still a member before retrying.`;
  }

  if (/posting permission is no longer available|restricted or banned from posting|CHAT_WRITE_FORBIDDEN|CHAT_RESTRICTED|USER_BANNED_IN_CHANNEL|RIGHT_FORBIDDEN/i.test(cleanMessage)) {
    return language === "vi"
      ? "Lỗi quyền đăng: tài khoản Telegram bị hạn chế hoặc bị ban quyền gửi trong nhóm này. Hệ thống không tự đồng bộ. Hãy kiểm tra quyền đăng hoặc trạng thái thành viên trên Telegram."
      : "Posting permission error: this Telegram account is restricted or banned from posting in this group. The system does not automatically sync. Check the account's posting permission or membership status in Telegram.";
  }

  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED|USER_BANNED|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(cleanMessage)) {
    return language === "vi"
      ? "Lỗi tài khoản Telegram: tài khoản hoặc phiên đăng nhập đã bị ban, thu hồi hoặc hết hiệu lực. Hệ thống không tự đồng bộ. Hãy kiểm tra tài khoản và đăng nhập lại nếu cần."
      : "Telegram account error: the account or login session was banned, revoked, or expired. The system does not automatically sync. Check the account and sign in again if needed.";
  }

  if (/destination .*is no longer the same destination|username no longer points/i.test(cleanMessage)) {
    return language === "vi"
      ? "Lỗi điểm đến: username hoặc nhóm đã thay đổi so với dữ liệu đã lưu. Hệ thống không tự đồng bộ nhóm. Hãy kiểm tra và chọn lại điểm đến."
      : "Destination error: the username or group changed from the saved destination. The system does not automatically sync groups. Check and select the destination again.";
  }

  return language === "vi" && cleanMessage ? cleanMessage : fallback;
}

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Translate a string. In VI mode returns the Vietnamese translation; in EN mode returns the key as-is. */
  t: (value: string) => string;
  /** Translate with simple {{variable}} interpolation. */
  ti: (value: string, vars: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Resolve {{variable}} placeholders in a string. */
function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "vi";
    return window.localStorage.getItem("telecampaign-language") === "en" ? "en" : "vi";
  });

  useEffect(() => {
    window.localStorage.setItem("telecampaign-language", language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (value: string) => language === "vi" ? (translations[value] ?? value) : value,
    ti: (value: string, vars: Record<string, string | number>) => {
      const translated = language === "vi" ? (translations[value] ?? value) : value;
      return interpolate(translated, vars);
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function LanguageOverride({ language, children }: { language: Language; children: ReactNode }) {
  const parent = useLanguage();
  const value = useMemo<LanguageContextValue>(() => ({
    ...parent,
    language,
    t: (text: string) => language === "vi" ? (translations[text] ?? text) : text,
    ti: (text: string, vars: Record<string, string | number>) => {
      const translated = language === "vi" ? (translations[text] ?? text) : text;
      return interpolate(translated, vars);
    },
  }), [language, parent]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
