import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyRound, Languages, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import type { AuthCaptcha } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { LanguageOverride, LanguageProvider, localizedErrorMessage, useLanguage } from '@/lib/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';
import { getGetUpgradeSummaryQueryKey, useGetGroupLibraryAccess, useGetUpgradeSummary } from '@workspace/api-client-react';

import Dashboard from '@/pages/dashboard';
import Account from '@/pages/account';
import Accounts from '@/pages/accounts';
import Groups from '@/pages/groups';
import Templates from '@/pages/templates';
import ProxyPage from '@/pages/proxy';
import Campaigns from '@/pages/campaigns';
import Calendar from '@/pages/calendar';
import Logs from '@/pages/logs';
import Settings from '@/pages/settings';
import Upgrade from '@/pages/upgrade';
import AdminDashboardPage from '@/pages/admin-dashboard';
import AdminNotificationsPage from '@/pages/admin-notifications';
import AdminUsersPage from '@/pages/admin-users';
import AdminUserSupportPage from '@/pages/admin-user-support';
import AdminLicenseKeysPage from '@/pages/admin-license-keys';
import AdminSystemSettingsPage from '@/pages/admin-system-settings';
import AdminOperationsPage from '@/pages/admin-operations';
import AdminActiveGroupsPage from '@/pages/admin-active-groups';
import SupportPage from '@/pages/support';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function AuthShell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="min-h-screen bg-[#f3f7fb] px-4 py-8 text-[#16304a] sm:grid sm:place-items-center sm:p-8">
      <section className="mx-auto w-full max-w-[440px]">
        <div className="relative mb-7 flex items-center justify-center gap-3">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
            <span className="hidden sm:block">
               <span className="block text-lg font-bold tracking-[-0.03em]">Telegram Campaign Manager</span>
              <span className="block text-xs text-[#66809a]">{t('Telegram Campaign Manager')}</span>
            </span>
          </div>
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-[#dbe6f0] bg-white p-1 shadow-sm" aria-label={language === 'vi' ? 'Chọn ngôn ngữ' : 'Choose language'}>
            {(['vi', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                aria-pressed={language === option}
                className={`rounded-md px-2 py-1 text-[10px] font-extrabold tracking-wide transition ${
                  language === option
                    ? 'bg-[#1888e8] text-white shadow-sm'
                    : 'text-[#7190ab] hover:bg-[#eef6fc] hover:text-[#16304a]'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-[#bde4f9] bg-[#eff8ff] px-3 py-2.5 text-center shadow-sm">
          <Languages className="h-4 w-4 shrink-0 text-[#1888e8]" aria-hidden="true" />
          <p className="text-[12px] font-semibold leading-5 text-[#48647c]">
            <span>International visitors:</span>{" "}
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className="font-extrabold text-[#0877d5] underline decoration-[#7dd3fc] underline-offset-2 hover:text-[#075985]"
            >
              Tap EN
            </button>
          </p>
        </div>
        <div className="rounded-3xl border border-[#dbe6f0] bg-white p-6 shadow-[0_18px_50px_rgba(31,73,110,.12)] sm:p-8">
          {children}
        </div>
      </section>
    </main>
  );
}

function Landing() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  return (
    <AuthShell>
      <div className="text-center">
        <p className="text-sm font-semibold text-[#1888e8]">TeleCampaign</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">{t('Controlled campaign delivery')}</h1>
        <p className="mt-4 text-sm leading-6 text-[#66809a]">{t('Sign in to securely manage your Telegram accounts and campaigns.')}</p>
        <button
          type="button"
          disabled={isLoading}
          className="mt-7 w-full rounded-xl bg-[#1888e8] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(24,136,232,.22)] transition hover:bg-[#0877d5] disabled:opacity-60"
          onClick={() => setLocation(user ? '/dashboard' : '/login')}
        >
          {isLoading ? t('Checking…') : user ? t('Go to dashboard') : t('Sign in')}
        </button>
      </div>
    </AuthShell>
  );
}

function AuthField({ icon: Icon, label, placeholder, type = 'text', value, onChange, autoComplete, helperText }: {
  icon: typeof UserRound;
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  helperText?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#28445e]">{label}</span>
      <span className="flex items-center gap-3 rounded-xl border border-[#ccdbe8] bg-[#fbfdff] px-3.5 py-3 transition focus-within:border-[#1888e8] focus-within:ring-4 focus-within:ring-[#1888e8]/10">
        <Icon className="h-[18px] w-[18px] text-[#7190ab]" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-[#16304a] outline-none placeholder:text-[#9aafc0]"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      </span>
      {helperText && <span className="mt-2 block text-xs leading-5 text-[#7190ab]">{helperText}</span>}
    </label>
  );
}

function AuthError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-xl border border-[#ffd0d0] bg-[#fff4f4] px-3.5 py-3 text-sm text-[#bd3434]">
      {message}
    </p>
  ) : null;
}

function useCaptcha() {
  const { getCaptcha } = useAuth();
  const { language, t } = useLanguage();
  const [challenge, setChallenge] = useState<AuthCaptcha | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setChallenge(null);
    setCode('');
    try {
      setChallenge(await getCaptcha());
    } catch (cause) {
      setLoadError(localizedErrorMessage(
        cause,
        language,
        t('Could not load CAPTCHA. Try refreshing it.'),
      ));
    } finally {
      setLoading(false);
    }
  }, [getCaptcha, language, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { challenge, code, setCode, loading, loadError, refresh };
}

function CaptchaField({
  challenge,
  code,
  onCodeChange,
  loading,
  loadError,
  onRefresh,
}: {
  challenge: AuthCaptcha | null;
  code: string;
  onCodeChange: (value: string) => void;
  loading: boolean;
  loadError: string | null;
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className="space-y-3 rounded-2xl border border-[#dbe6f0] bg-[#f8fbfe] p-3.5">
      <legend className="px-1 text-sm font-semibold text-[#28445e]">{t('Security verification')}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2.5">
        <div className="relative flex h-[68px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-[#bde4f9] bg-[#eff8ff]">
          {challenge && (
            <img
              src={challenge.image}
              alt={t('CAPTCHA image')}
              className="h-full w-full object-contain"
              data-testid="auth-captcha-image"
            />
          )}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 bg-[#eff8ff] text-xs font-semibold text-[#66809a]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {t('Loading CAPTCHA…')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title={t('Refresh CAPTCHA')}
          aria-label={t('Refresh CAPTCHA')}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#ccdbe8] bg-white px-2 text-xs font-bold text-[#147ed8] transition hover:border-[#1888e8] hover:bg-[#eff8ff] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="auth-captcha-refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('Refresh code')}</span>
        </button>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#28445e]">{t('Security code')}</span>
        <span className="flex items-center gap-3 rounded-xl border border-[#ccdbe8] bg-white px-3.5 py-3 transition focus-within:border-[#1888e8] focus-within:ring-4 focus-within:ring-[#1888e8]/10">
          <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-[#7190ab]" aria-hidden="true" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-bold uppercase tracking-[0.18em] text-[#16304a] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#9aafc0]"
            type="text"
            value={code}
            onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
            placeholder={t('Enter the code shown')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            disabled={!challenge || loading}
            data-testid="auth-captcha-input"
          />
        </span>
      </label>
      {loadError && <p role="alert" className="text-xs leading-5 text-[#bd3434]">{loadError}</p>}
    </fieldset>
  );
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { language, t } = useLanguage();
  const captcha = useCaptcha();
  const [username, setUsername] = useState(typeof window !== 'undefined' && window.location.search.includes('step=2') ? "demo_admin" : "");
  const [password, setPassword] = useState(typeof window !== 'undefined' && window.location.search.includes('step=2') ? "••••••••••" : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!captcha.challenge || !captcha.code.trim()) {
      setError(t('Enter the CAPTCHA code'));
      if (!captcha.challenge && !captcha.loading) void captcha.refresh();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password, captcha.challenge.challengeId, captcha.code);
      setPassword('');
      setLocation('/dashboard', { replace: true });
    } catch (cause) {
      setError(localizedErrorMessage(cause, language, t('Could not sign in. Please try again.')));
      await captcha.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-bold tracking-[-0.035em]">{t('Sign in to TeleCampaign')}</h1>
        <p className="mt-2 text-sm leading-6 text-[#6d8499]">{t('Enter your credentials to access the dashboard.')}</p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <AuthField
          icon={UserRound}
          label={t('Username')}
          placeholder={t('Username placeholder')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthField
          icon={LockKeyhole}
          label={t('Password')}
          placeholder={t('Password placeholder')}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <CaptchaField
          challenge={captcha.challenge}
          code={captcha.code}
          onCodeChange={captcha.setCode}
          loading={captcha.loading}
          loadError={captcha.loadError}
          onRefresh={() => void captcha.refresh()}
        />
        <AuthError message={error} />
        <button
          disabled={submitting || captcha.loading || !captcha.challenge}
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1888e8] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(24,136,232,.22)] transition hover:bg-[#0877d5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {submitting ? t('Signing in…') : t('Sign in')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[#66809a]">
        <button
          type="button"
          onClick={() => setLocation('/register')}
          className="font-semibold text-[#147ed8] hover:underline"
        >
          {t('No account yet? Register for free')}
        </button>
      </p>
    </AuthShell>
  );
}

function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const { language, t } = useLanguage();
  const captcha = useCaptcha();
  const [username, setUsername] = useState(typeof window !== 'undefined' && window.location.search.includes('step=1') ? "demo_admin" : "");
  const [password, setPassword] = useState(typeof window !== 'undefined' && window.location.search.includes('step=1') ? "••••••••••" : "");
  const [confirmPassword, setConfirmPassword] = useState(typeof window !== 'undefined' && window.location.search.includes('step=1') ? "••••••••••" : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trialMessage = language === 'vi'
    ? 'Dùng thử miễn phí trong 1 ngày. Sau đó, hãy kích hoạt license key PLUS, PRO hoặc UNLIMITED để tiếp tục.'
    : 'Start with a free 1-day trial. Then activate a PLUS, PRO, or UNLIMITED license key to continue.';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError(t('Passwords do not match'));
      return;
    }
    if (!captcha.challenge || !captcha.code.trim()) {
      setError(t('Enter the CAPTCHA code'));
      if (!captcha.challenge && !captcha.loading) void captcha.refresh();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register(
        username,
        password,
        confirmPassword,
        captcha.challenge.challengeId,
        captcha.code,
      );
      setPassword('');
      setConfirmPassword('');
      setLocation('/dashboard', { replace: true });
    } catch (cause) {
      setError(localizedErrorMessage(cause, language, t('Could not register. Please try again.')));
      await captcha.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-bold tracking-[-0.035em]">{t('Create your account')}</h1>
        <p className="mt-2 text-sm leading-6 text-[#6d8499]">{trialMessage}</p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <AuthField
          icon={UserRound}
          label={t('Username')}
          placeholder={t('Username placeholder')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthField
          icon={LockKeyhole}
          label={t('Password')}
          placeholder={t('Password placeholder')}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          helperText={
            language === 'vi'
              ? 'Mật khẩu hợp lệ: ít nhất 10 ký tự, gồm cả chữ cái và số.'
              : 'Valid password: at least 10 characters with both letters and numbers.'
          }
        />
        <AuthField
          icon={KeyRound}
          label={t('Confirm password')}
          placeholder={t('Confirm password placeholder')}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />
        <CaptchaField
          challenge={captcha.challenge}
          code={captcha.code}
          onCodeChange={captcha.setCode}
          loading={captcha.loading}
          loadError={captcha.loadError}
          onRefresh={() => void captcha.refresh()}
        />
        <AuthError message={error} />
        <button
          disabled={submitting || captcha.loading || !captcha.challenge}
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1888e8] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(24,136,232,.22)] transition hover:bg-[#0877d5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {submitting ? t('Creating account…') : t('Register')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[#66809a]">
        <button
          type="button"
          onClick={() => setLocation('/login')}
          className="font-semibold text-[#147ed8] hover:underline"
        >
          {t('Already have an account? Sign in')}
        </button>
      </p>
    </AuthShell>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1420] text-[#dce8f5]">
        <LoaderCircle className="h-6 w-6 animate-spin text-[#65b8f8]" />
      </main>
    );
  return user ? <>{children}</> : <Redirect to="/login" replace />;
}

function WorkspaceRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1420] text-[#dce8f5]">
        <LoaderCircle className="h-6 w-6 animate-spin text-[#65b8f8]" />
      </main>
    );
  }
  if (!user) return <Redirect to="/login" replace />;
  return <SubscriptionGate>{children}</SubscriptionGate>;
}

function SubscriptionGate({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const { data: summary, isLoading, isError } = useGetUpgradeSummary({
    query: {
      queryKey: getGetUpgradeSummaryQueryKey(),
      retry: false,
    },
  });
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1420] text-[#dce8f5]">
        <LoaderCircle className="h-6 w-6 animate-spin text-[#65b8f8]" />
      </main>
    );
  }

  if (!isError && summary?.subscription.status === 'expired') {
    const expiredText = language === 'vi'
      ? 'Thời gian dùng thử hoặc gói dịch vụ của bạn đã hết hạn.'
      : 'Your trial or subscription has expired.';
    const guidance = language === 'vi'
      ? 'Kích hoạt license key PLUS, PRO hoặc UNLIMITED để tiếp tục dùng TeleCampaign.'
      : 'Activate a PLUS, PRO, or UNLIMITED license key to continue using TeleCampaign.';
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f7fb] px-4 py-8 text-[#16304a]">
        <section className="w-full max-w-[500px] rounded-3xl border border-[#dbe6f0] bg-white p-7 text-center shadow-[0_18px_50px_rgba(31,73,110,.12)] sm:p-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff4e8] text-[#dc6b19]">
            <KeyRound className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em]">{expiredText}</h1>
          <p className="mt-3 text-sm leading-6 text-[#66809a]">{guidance}</p>
          <button
            type="button"
            onClick={() => setLocation('/upgrade')}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1888e8] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(24,136,232,.22)] transition hover:bg-[#0877d5]"
          >
            <KeyRound className="h-4 w-4" />
            {language === 'vi' ? 'Mua / kích hoạt key' : 'Buy / activate key'}
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1420] text-[#dce8f5]">
        <LoaderCircle className="h-6 w-6 animate-spin text-[#65b8f8]" />
      </main>
    );
  return user?.role === 'admin' ? <LanguageOverride language="vi">{children}</LanguageOverride> : <Redirect to="/dashboard" replace />;
}

function GroupLibraryRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const access = useGetGroupLibraryAccess();
  if (isLoading || access.isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#0b1420] text-[#dce8f5]"><LoaderCircle className="h-6 w-6 animate-spin text-[#65b8f8]" /></main>;
  }
  if (!user) return <Redirect to="/login" replace />;
  if (!access.data?.canView) return <Redirect to="/dashboard" replace />;
  return user.role === "admin" ? children : <SubscriptionGate>{children}</SubscriptionGate>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/sign-in/*?"><Redirect to="/login" replace /></Route>
        <Route path="/sign-up/*?"><Redirect to="/register" replace /></Route>
        <Route path="/dashboard" component={() => <WorkspaceRoute><Dashboard /></WorkspaceRoute>} />
        <Route path="/dashboard/telegram-accounts" component={() => <WorkspaceRoute><Accounts /></WorkspaceRoute>} />
        <Route path="/dashboard/groups" component={() => <WorkspaceRoute><Groups /></WorkspaceRoute>} />
        <Route path="/dashboard/templates" component={() => <WorkspaceRoute><Templates /></WorkspaceRoute>} />
        <Route path="/dashboard/campaigns" component={() => <WorkspaceRoute><Campaigns /></WorkspaceRoute>} />
        <Route path="/dashboard/proxy" component={() => <WorkspaceRoute><ProxyPage /></WorkspaceRoute>} />
        <Route path="/group-library" component={() => <GroupLibraryRoute><AdminActiveGroupsPage mode="workspace" /></GroupLibraryRoute>} />
        <Route path="/dashboard/calendar" component={() => <WorkspaceRoute><Calendar /></WorkspaceRoute>} />
        <Route path="/dashboard/logs" component={() => <WorkspaceRoute><Logs /></WorkspaceRoute>} />
        <Route path="/dashboard/account" component={() => <WorkspaceRoute><Account /></WorkspaceRoute>} />
        <Route path="/dashboard/settings" component={() => <ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/dashboard/support" component={() => <WorkspaceRoute><SupportPage /></WorkspaceRoute>} />
        <Route path="/upgrade" component={() => <ProtectedRoute><Upgrade /></ProtectedRoute>} />
        <Route path="/admin" component={() => <AdminRoute><AdminDashboardPage /></AdminRoute>} />
        <Route path="/admin/notifications" component={() => <AdminRoute><AdminNotificationsPage /></AdminRoute>} />
        <Route path="/admin/users" component={() => <AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/users/:id/support">
          {(params) => <AdminRoute><AdminUserSupportPage userId={params.id} /></AdminRoute>}
        </Route>
        <Route path="/admin/license-keys" component={() => <AdminRoute><AdminLicenseKeysPage /></AdminRoute>} />
        <Route path="/admin/system-settings" component={() => <AdminRoute><AdminSystemSettingsPage /></AdminRoute>} />
        <Route path="/admin/operations" component={() => <AdminRoute><AdminOperationsPage /></AdminRoute>} />
        <Route path="/admin/active-groups" component={() => <AdminRoute><AdminActiveGroupsPage mode="admin" /></AdminRoute>} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
