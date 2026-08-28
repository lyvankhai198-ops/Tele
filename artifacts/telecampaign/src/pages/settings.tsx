import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, LogOut, ShieldCheck, UserCircle } from "lucide-react";
import { useChangeAuthPassword, useRevokeOtherAuthSessions } from "@workspace/api-client-react";
import { AppLayout, Input, Modal, PageIntro, Panel, PrimaryButton, QuietButton, SectionHeader, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-2xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-[13px] font-semibold leading-5 text-[#be123c]">{message}</p>;
}

export default function Settings() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const changePasswordMutation = useChangeAuthPassword();
  const revokeSessionsMutation = useRevokeOtherAuthSessions();

  function clearPasswordMessages() {
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearPasswordMessages();
    if (newPassword !== confirmPassword) {
      setPasswordError(t("Passwords do not match"));
      return;
    }
    try {
      await changePasswordMutation.mutateAsync({
        data: { currentPassword, newPassword, confirmPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(t("Password changed successfully. Other sessions were signed out."));
    } catch (error) {
      setPasswordError(localizedErrorMessage(error, language, t("Could not change password. Please try again.")));
    }
  }

  async function revokeOtherSessions() {
    try {
      const result = await revokeSessionsMutation.mutateAsync();
      setShowRevokeConfirm(false);
      setToast(result.revokedCount > 0 ? t("Other sessions revoked.") : t("No other sessions were active."));
    } catch (error) {
      setShowRevokeConfirm(false);
      setToast(localizedErrorMessage(error, language, t("Could not revoke other sessions. Please try again.")));
    }
  }

  return (
    <AppLayout activePage="settings" title={t("Settings")} subtitle={t("Manage your account security and sign-in sessions.")}>
      <PageIntro
        kicker={t("Personal settings")}
        heading={t("Settings")}
        detail={t("Manage your account security and sign-in sessions.")}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel className="p-5 sm:p-7">
            <SectionHeader
              eyebrow={t("Account information")}
              title={t("Account")}
              detail={t("Your username is used to sign in to TeleCampaign.")}
            />
            <div className="flex items-center gap-4 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8edff] text-[#1a2b88]">
                <UserCircle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-[#0f172a]">{user?.username ?? "—"}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#64748b]">{user?.role === "admin" ? "Admin" : t("User")}</p>
              </div>
            </div>
          </Panel>

          <Panel className="p-5 sm:p-7">
            <SectionHeader
              eyebrow={t("Account security")}
              title={t("Change password")}
              detail={t("Change your password regularly and revoke sessions you do not recognize.")}
            />
            <form className="space-y-4" onSubmit={submitPassword}>
              <input
                type="text"
                name="username"
                value={user?.username ?? ""}
                autoComplete="username"
                readOnly
                tabIndex={-1}
                className="sr-only"
              />
              <Input
                label={t("Current password")}
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t("Current password placeholder")}
                type="password"
                autoComplete="current-password"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t("New password")}
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder={t("New password placeholder")}
                  type="password"
                  autoComplete="new-password"
                />
                <Input
                  label={t("Confirm new password")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={t("Confirm new password placeholder")}
                  type="password"
                  autoComplete="new-password"
                />
              </div>
              <p className="text-[12px] font-semibold text-[#64748b]">{t("At least 10 characters with both letters and numbers.")}</p>
              <ErrorNotice message={passwordError} />
              {passwordSuccess && <p role="status" className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[13px] font-semibold leading-5 text-[#15803d]">{passwordSuccess}</p>}
              <div className="flex justify-end pt-2">
                <PrimaryButton type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {changePasswordMutation.isPending ? t("Changing password…") : t("Change password")}
                </PrimaryButton>
              </div>
            </form>
          </Panel>
        </div>

        <Panel className="h-fit p-5 sm:p-7">
          <SectionHeader
            eyebrow={t("Active sessions")}
            title={t("Sign-in sessions")}
            detail={t("Sign out every other device while keeping this session active.")}
          />
          <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#dbeafe] text-[#2563eb]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-[12px] font-semibold leading-5 text-[#1e40af]">{t("Your current session will remain active.")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRevokeConfirm(true)}
            disabled={revokeSessionsMutation.isPending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#fecdd3] bg-white px-4 py-3 text-[13px] font-extrabold text-[#be123c] transition hover:bg-[#fff1f2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revokeSessionsMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {t("Revoke other sessions")}
          </button>
          <div className="mt-5 flex items-start gap-3 border-t border-[#eef2f6] pt-5 text-[12px] font-semibold leading-5 text-[#64748b]">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#64748b]" />
            <p>{t("Changing your password also signs out other sessions.")}</p>
          </div>
        </Panel>
      </div>

      {showRevokeConfirm && (
        <Modal
          title={t("Revoke other sessions?")}
          description={t("This will sign out every other device. Your current session will remain active.")}
          onClose={() => setShowRevokeConfirm(false)}
        >
          <div className="flex justify-end gap-2">
            <QuietButton onClick={() => setShowRevokeConfirm(false)}>{t("Cancel")}</QuietButton>
            <button
              type="button"
              onClick={() => void revokeOtherSessions()}
              disabled={revokeSessionsMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#be123c] px-5 py-3 text-[14px] font-extrabold text-white transition hover:bg-[#9f1239] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revokeSessionsMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
              <LogOut className="h-4 w-4" />
              {t("Revoke other sessions")}
            </button>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}