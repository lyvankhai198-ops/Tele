export function campaignDeleteError(error: unknown, language: "vi" | "en"): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CAMPAIGN_DELETE_BUSY")) return language === "vi"
    ? "Dữ liệu đang bận. Lần xóa này đã được hủy an toàn, vui lòng thử lại sau ít giây."
    : "The data is busy. This deletion was safely cancelled. Please retry in a few seconds.";
  if (/504|502|503|gateway|<\s*(?:!doctype|html|head|body)\b/i.test(message)) return language === "vi"
    ? "Máy chủ phản hồi chậm. Vui lòng làm mới danh sách để kiểm tra kết quả trước khi xóa lại."
    : "The server is slow to respond. Refresh the list to check the result before deleting again.";
  // Never render proxy HTML, SQL details or internal errors into the toast.
  return language === "vi"
    ? "Chưa thể xóa chiến dịch. Vui lòng làm mới danh sách rồi thử lại."
    : "Campaigns could not be deleted. Refresh the list and try again.";
}
