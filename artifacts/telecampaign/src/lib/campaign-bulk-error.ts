export function campaignBulkError(error: unknown, language: "vi" | "en"): string {
  const message = error instanceof Error ? error.message : "";
  if (/504|502|503|gateway|<\s*(?:!doctype|html|head|body)\b|fetch|network/i.test(message)) return language === "vi"
    ? "Mất kết nối khi nhận kết quả. Tác vụ có thể vẫn đang chạy; đừng tạo yêu cầu mới. Mở lại trang để xem tiến độ."
    : "The connection was lost. The operation may still be running; do not submit a new request. Reopen the page to check progress.";
  return language === "vi"
    ? "Chưa thể nhận kết quả. Vui lòng kiểm tra tiến độ trước khi chạy lại để tránh tạo trùng."
    : "The result is unavailable. Check operation progress before retrying to avoid duplicate runs.";
}
