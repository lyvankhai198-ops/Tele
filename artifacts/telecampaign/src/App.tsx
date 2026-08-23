import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyRound, LoaderCircle, LockKeyhole, MessageCircle, UserRound } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { LanguageProvider, localizedErrorMessage, useLanguage } from '@/lib/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';
import { useGetUpgradeSummary } from '@workspace/api-client-react';

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
import AdminUsersPage from '@/pages/admin-users';
import AdminLicenseKeysPage from '@/pages/admin-license-keys';
import AdminSystemSettingsPage from '@/pages/admin-system-settings';
import AdminOperationsPage from '@/pages/admin-operations';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function AuthShell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="min-h-screen bg-[#f4efe6] px-4 py-6 text-[#17343b] sm:px-8 sm:py-10">
      <section className="mx-auto w-full max-w-[1060px]">
        <header className="mb-7 flex items-center justify-between gap-4 sm:mb-10">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e97961] text-[#17343b] shadow-[0_12px_26px_rgba(211,110,89,.22)]">
              <MessageCircle className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block font-serif text-[20px] font-normal tracking-[-0.04em]">Tele Campaign</span>
              <span className="mt-0.5 block font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#71817d]">{t('Telegram Campaign Manager')}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[#d9d1c4] bg-[#fbf8f2] p-1 shadow-sm" aria-label={language === 'vi' ? 'Chọn ngôn ngữ' : 'Choose language'}>
            {(['vi', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                aria-pressed={language === option}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-wide transition ${
                  language === option
                    ? 'bg-[#17343b] text-[#fff8f1] shadow-sm'
                    : 'text-[#71817d] hover:bg-[#e9dfd2] hover:text-[#17343b]'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </header>
        <div className="grid items-stretch gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:gap-8">
          <aside className="relative hidden overflow-hidden rounded-[28px] bg-[#17343b] p-8 text-[#fff8f1] lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[18px] border-[#d36e59]/30" />
            <div className="absolute -bottom-20 -left-16 h-52 w-52 rounded-full border-[24px] border-[#e97961]/20" />
            <div className="relative">
              <p className="mb-5 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#e97961]"><span className="h-1.5 w-1.5 rounded-full bg-[#e97961]" />{language === 'vi' ? 'Không gian vận hành' : 'Operator workspace'}</p>
              <h2 className="max-w-[320px] font-serif text-[46px] leading-[1.04] tracking-[-0.055em]">{language === 'vi' ? 'Gửi đúng người. Đúng nhịp.' : 'Send with intent.'}</h2>
              <p className="mt-5 max-w-[320px] text-[13px] font-medium leading-6 text-[#b8c8bd]">{t('Sign in to securely manage your Telegram accounts and campaigns.')}</p>
            </div>
            <div className="relative flex items-center gap-3 border-t border-[#446057] pt-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e97961] text-[#17343b]"><MessageCircle className="h-4 w-4" /></span>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#b8c8bd]">{language === 'vi' ? 'Kiểm soát · Rõ ràng · An toàn' : 'Controlled · Clear · Safe'}</p>
            </div>
          </aside>
          <div className="rounded-[28px] border border-[#d9d1c4] bg-[#fbf8f2] p-6 shadow-[0_20px_60px_rgba(79,61,42,.09)] sm:p-10">
            {children}
          </div>
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
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#d36e59]">TeleCampaign</p>
        <h1 className="mt-3 font-serif text-[36px] font-normal leading-tight tracking-[-0.05em]">{t('Controlled campaign delivery')}</h1>
        <p className="mt-4 text-[13px] font-medium leading-6 text-[#71817d]">{t('Sign in to securely manage your Telegram accounts and campaigns.')}</p>
        <button
          type="button"
          disabled={isLoading}
          className="mt-7 w-full rounded-xl bg-[#e97961] px-5 py-3 text-[13px] font-extrabold text-[#17343b] shadow-[0_8px_20px_rgba(211,110,89,.18)] transition hover:bg-[#ee876c] disabled:opacity-60"
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
       <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#4d625e]">{label}</span>
       <span className="flex items-center gap-3 rounded-xl border border-[#d9d1c4] bg-[#fdfaf5] px-3.5 py-3 transition focus-within:border-[#d36e59] focus-within:ring-4 focus-within:ring-[#d36e59]/10">
         <Icon className="h-[18px] w-[18px] text-[#8b9a92]" />
        <input
           className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#17343b] outline-none placeholder:text-[#9ba6a0]"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      </span>
       {helperText && <span className="mt-2 block text-[11px] leading-5 text-[#71817d]">{helperText}</span>}
    </label>
  );
}

function AuthError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-xl border border-[#edc6bc] bg-[#fff1ed] px-3.5 py-3 text-[12px] font-semibold text-[#b84c35]">
      {message}
    </p>
  ) : null;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { language, t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      setPassword('');
      setLocation('/dashboard', { replace: true });
    } catch (cause) {
      setError(localizedErrorMessage(cause, language, t('Could not sign in. Please try again.')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
       <div className="mb-8">
         <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#d36e59]">{language === 'vi' ? 'Đăng nhập an toàn' : 'Secure sign in'}</p>
         <h1 className="font-serif text-[38px] font-normal leading-tight tracking-[-0.05em]">{t('Sign in to TeleCampaign')}</h1>
         <p className="mt-3 max-w-[420px] text-[13px] font-medium leading-6 text-[#71817d]">{t('Enter your credentials to access the dashboard.')}</p>
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
        <AuthError message={error} />
        <button
          disabled={submitting}
          type="submit"
           className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#e97961] px-5 py-3 text-[13px] font-extrabold text-[#17343b] shadow-[0_8px_20px_rgba(211,110,89,.18)] transition hover:bg-[#ee876c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {submitting ? t('Signing in…') : t('Sign in')}
        </button>
      </form>
       <p className="mt-7 text-center text-[13px] font-medium text-[#71817d]">
        <button
          type="button"
          onClick={() => setLocation('/register')}
           className="font-extrabold text-[#d36e59] hover:underline"
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    setError(null);
    setSubmitting(true);
    try {
      await register(username, password, confirmPassword);
      setPassword('');
      setConfirmPassword('');
      setLocation('/dashboard', { replace: true });
    } catch (cause) {
      setError(localizedErrorMessage(cause, language, t('Could not register. Please try again.')));
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
        <AuthError message={error} />
        <button
          disabled={submitting}
          type="submit"
           className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#e97961] px-5 py-3 text-[13px] font-extrabold text-[#17343b] shadow-[0_8px_20px_rgba(211,110,89,.18)] transition hover:bg-[#ee876c] disabled:cursor-not-allowed disabled:opacity-60"
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
  const { data: summary, isLoading, isError } = useGetUpgradeSummary();
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
  return user?.role === 'admin' ? <>{children}</> : <Redirect to="/dashboard" replace />;
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
        <Route path="/dashboard/calendar" component={() => <WorkspaceRoute><Calendar /></WorkspaceRoute>} />
        <Route path="/dashboard/logs" component={() => <WorkspaceRoute><Logs /></WorkspaceRoute>} />
        <Route path="/dashboard/account" component={() => <WorkspaceRoute><Account /></WorkspaceRoute>} />
        <Route path="/dashboard/settings" component={() => <WorkspaceRoute><Settings /></WorkspaceRoute>} />
        <Route path="/upgrade" component={() => <ProtectedRoute><Upgrade /></ProtectedRoute>} />
        <Route path="/admin" component={() => <AdminRoute><AdminDashboardPage /></AdminRoute>} />
        <Route path="/admin/users" component={() => <AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/license-keys" component={() => <AdminRoute><AdminLicenseKeysPage /></AdminRoute>} />
        <Route path="/admin/system-settings" component={() => <AdminRoute><AdminSystemSettingsPage /></AdminRoute>} />
        <Route path="/admin/operations" component={() => <AdminRoute><AdminOperationsPage /></AdminRoute>} />
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
      <AuthProvider>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </LanguageProvider>
      </AuthProvider>
    </WouterRouter>
  );
}

export default App;
