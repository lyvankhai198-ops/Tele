import { useMemo } from "react";
import { Link } from "wouter";
import { useListAdminLicenseKeys, getListAdminLicenseKeysQueryKey } from "@workspace/api-client-react";
import { KeyRound, ExternalLink } from "lucide-react";
import { AdminLicenseKeySecret } from "@/components/admin/AdminLicenseKeySecret";
import { useLanguage } from "@/lib/i18n";

export function AdminUserLicenseHistory({ userId }: { userId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const params = {};
  const { data, isLoading, isError } = useListAdminLicenseKeys(params, {
    query: { queryKey: getListAdminLicenseKeysQueryKey(params), staleTime: 30_000 },
  });
  const records = useMemo(
    () => (data ?? []).filter((key) => key.claimedByUserId === userId)
      .sort((a, b) => (b.claimedAt ?? b.createdAt).localeCompare(a.claimedAt ?? a.createdAt)),
    [data, userId],
  );

  return (
    <section className="rounded-2xl border border-[#dce7ed] bg-white p-4 sm:p-5" aria-labelledby={`license-history-${userId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`license-history-${userId}`} className="flex items-center gap-2 text-sm font-extrabold text-[#17394e]">
            <KeyRound className="h-4 w-4 text-[#167b91]" />{vi ? "Lịch sử key đã kích hoạt" : "Activated key history"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#657d8a]">{vi ? "Lịch sử key độc lập với gói thuê bao hiện tại; một tài khoản có thể có nhiều key." : "Key history is separate from the current subscription; one account may have multiple keys."}</p>
        </div>
        <Link href={`/admin/license-keys?userId=${encodeURIComponent(userId)}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#126f86] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147da3]"
          data-testid={`link-user-license-inventory-${userId}`}>
          {vi ? "Mở danh mục key" : "Open key inventory"}<ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      {isLoading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-[#eff4f6]" aria-label={vi ? "Đang tải lịch sử key" : "Loading key history"} />
        : isError ? <p role="alert" className="mt-4 text-sm text-[#9b403c]">{vi ? "Không tải được lịch sử key." : "Could not load key history."}</p>
          : records.length === 0 ? <p className="mt-4 rounded-xl bg-[#f5f8fa] px-3 py-4 text-sm text-[#657d8a]">{vi ? "Chưa có bản ghi key được liên kết trực tiếp với tài khoản này." : "No key records are directly linked to this account."}</p>
            : <ol className="mt-4 divide-y divide-[#e8eef1]">
              {records.map((key) => (
                <li key={key.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold uppercase tracking-wide text-[#234b61]">{key.plan}</span>
                      <span className="rounded-full bg-[#eff5f7] px-2 py-0.5 text-[10px] font-bold text-[#587280]">{key.status === "claimed" ? (vi ? "Đã kích hoạt" : "Activated") : key.status === "revoked" ? (vi ? "Đã thu hồi" : "Revoked") : (vi ? "Khả dụng" : "Available")}</span>
                      <span className="text-xs text-[#718793]">{key.durationDays} {vi ? "ngày" : "days"}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#657d8a]">{vi ? "Kích hoạt" : "Activated"}: {key.claimedAt ? new Date(key.claimedAt).toLocaleString(vi ? "vi-VN" : "en-GB") : "—"}</p>
                    {key.revokedAt && <p className="mt-1 text-xs text-[#8b5350]">{vi ? "Thu hồi" : "Revoked"}: {new Date(key.revokedAt).toLocaleString(vi ? "vi-VN" : "en-GB")}</p>}
                    <p className="mt-1 text-[11px] text-[#8799a2]">{vi ? "ID kỹ thuật" : "Technical ID"}: <span className="font-mono">{key.id}</span></p>
                  </div>
                  <div className="sm:min-w-[180px]">
                    <AdminLicenseKeySecret key={key.id} licenseKeyId={key.id} />
                    <Link href={`/admin/license-keys?keyId=${encodeURIComponent(key.id)}&userId=${encodeURIComponent(userId)}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#126f86] hover:underline"
                      data-testid={`link-user-license-record-${key.id}`}>
                      {vi ? "Mở bản ghi" : "Open record"}<ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>}
    </section>
  );
}
