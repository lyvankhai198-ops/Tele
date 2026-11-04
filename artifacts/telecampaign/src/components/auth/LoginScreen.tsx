import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import type { AuthCaptcha } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";
import "./login-screen.css";

type LoginScreenProps = {
 username:string; password:string; otp:string;
 challenge:AuthCaptcha|null; captchaCode:string; captchaLoading:boolean; captchaError:string|null;
 error:string|null; submitting:boolean; requiresOtp:boolean;
 onUsernameChange:(value:string)=>void; onPasswordChange:(value:string)=>void; onOtpChange:(value:string)=>void; onCaptchaChange:(value:string)=>void;
 onCaptchaRefresh:()=>void; onNavigate:(path:string)=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
};

export function LoginScreen({username,password,otp,challenge,captchaCode,captchaLoading,captchaError,error,submitting,requiresOtp,onUsernameChange,onPasswordChange,onOtpChange,onCaptchaChange,onCaptchaRefresh,onNavigate,onSubmit}:LoginScreenProps){
 const {language,setLanguage,t,isChangingLanguage,languageError}=useLanguage();
 const [showPassword,setShowPassword]=useState(false);
 const [twoFactorOpen,setTwoFactorOpen]=useState(false);
 const otpInputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(requiresOtp)setTwoFactorOpen(true);},[requiresOtp]);
 useEffect(()=>{if(requiresOtp&&twoFactorOpen)otpInputRef.current?.focus();},[requiresOtp,twoFactorOpen]);
 const c={
  eyebrow:t("A clearer way to run Telegram campaigns"),
  introTitle:t("Your campaigns,\nin good hands."),
  introBody:t("Connect your Telegram accounts, plan your sends, and keep an eye on delivery — all from one considered workspace."),
  introNote:t("Sign in to pick up where your work left off."),
  signIn:t("Welcome back"),
  signInBody:t("Sign in to your Telecampaign workspace."),
  username:t("Username"),
  usernamePlaceholder:t("Your account username"),
  password:t("Password"),
  passwordPlaceholder:t("Enter your password"),
  showPassword:t("Show password"),
  hidePassword:t("Hide password"),
  forgotPassword:t("Forgot password?"),
  forgotUsername:t("Forgot username?"),
  captcha:t("Security check"),
  refreshCaptcha:t("Get a new code"),
  captchaLabel:t("Enter the characters shown"),
  captchaPlaceholder:t("Type the code"),
  twoFactor:t("Use a 2-step verification code"),
  twoFactorHelp:t("Only if two-step verification is enabled on your account."),
  twoFactorPlaceholder:t("6-digit code or recovery code"),
  submit:t("Sign in"),
  invitation:t("New to Telecampaign?"),
  register:t("Create an account"),
  languageInvite:t("Choose the language you’re most comfortable with."),
  welcome:t("Independent Telegram operations, made more manageable."),
 };
  return (
    <main className="tc-login" lang={language}>
      <div className="tc-login__frame">
        <header className="tc-login__topbar">
          <a className="tc-login__brand" href="#login" aria-label="Telecampaign">
            <span className="tc-login__brand-mark">
              <img src="/icon.png" alt="" />
            </span>
            <span className="tc-login__brand-name">{t("Telecampaign")}</span>
          </a>
          <div className="tc-login__language">
            <span>{c.languageInvite}</span>
            <LanguageSelector language={language} onChange={setLanguage} disabled={isChangingLanguage} compact />
          </div>
        </header>

        <div className="tc-login__main">
          <section className="tc-login__intro" aria-labelledby="tc-intro-title">
            <div className="tc-login__intro-content">
              <div className="tc-login__eyebrow"><span />{c.eyebrow}</div>
              <h1 id="tc-intro-title">{c.introTitle}</h1>
              <p className="tc-login__intro-body">{c.introBody}</p>
              <div className="tc-login__intro-note">
                <span className="tc-login__note-icon"><ArrowDownRight size={17} aria-hidden="true" /></span>
                <span>{c.introNote}</span>
              </div>
            </div>
            <div className="tc-login__visual" aria-hidden="true">
              <div className="tc-login__visual-grid" />
              <div className="tc-login__orbit tc-login__orbit--outer" />
              <div className="tc-login__orbit tc-login__orbit--inner" />
              <div className="tc-login__visual-axis tc-login__visual-axis--one" />
              <div className="tc-login__visual-axis tc-login__visual-axis--two" />
              <div className="tc-login__signal tc-login__signal--one" />
              <div className="tc-login__signal tc-login__signal--two" />
              <div className="tc-login__signal tc-login__signal--three" />
              <div className="tc-login__plane"><ArrowRight size={29} strokeWidth={1.65} /></div>
              <div className="tc-login__visual-caption"><span>TC / 01</span><span>{t("Campaign control")}</span></div>
            </div>
            <div className="tc-login__intro-footer"><MessageCircle size={15} aria-hidden="true" />{c.welcome}</div>
          </section>

          <section className="tc-login__form-side" id="login" aria-labelledby="tc-sign-in-title">
            <div className="tc-login__card">
              <div className="tc-login__card-heading">
                <div className="tc-login__welcome-mark"><LockKeyhole size={18} aria-hidden="true" /></div>
                <div className="tc-login__card-kicker">{t("Telecampaign")} {t("Account")}</div>
                <h2 id="tc-sign-in-title">{c.signIn}</h2>
                <p>{c.signInBody}</p>
              </div>

              <form className="tc-login__form" onSubmit={onSubmit}>
                <label className="tc-login__field">
                  <span className="tc-login__field-label">{c.username}</span>
                  <span className="tc-login__input-wrap">
                    <UserRound size={18} aria-hidden="true" />
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => onUsernameChange(event.target.value)}
                      placeholder={c.usernamePlaceholder}
                      autoComplete="username"
                      name="username"
                    />
                  </span>
                </label>

                <label className="tc-login__field">
                  <span className="tc-login__field-label">{c.password}</span>
                  <span className="tc-login__input-wrap">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => onPasswordChange(event.target.value)}
                      placeholder={c.passwordPlaceholder}
                      autoComplete="current-password"
                      name="password"
                    />
                    <button
                      className="tc-login__reveal"
                      type="button"
                      aria-label={showPassword ? c.hidePassword : c.showPassword}
                      title={showPassword ? c.hidePassword : c.showPassword}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>

                <div className="tc-login__recovery-links">
                  <button type="button" onClick={() => onNavigate('/forgot-password')}>{c.forgotPassword}</button>
                  <button type="button" onClick={() => onNavigate('/forgot-username')}>{c.forgotUsername}</button>
                </div>

                <fieldset className="tc-login__captcha">
                  <legend><ShieldCheck size={15} aria-hidden="true" />{c.captcha}</legend>
                  <div className="tc-login__captcha-row">
                    {challenge && <img src={challenge.image} alt={t("CAPTCHA image")} data-testid="auth-captcha-image" />}
                    {!challenge && <span role="status">{t("Loading CAPTCHA…")}</span>}
                    <button type="button" onClick={onCaptchaRefresh} disabled={captchaLoading || submitting} aria-label={c.refreshCaptcha} title={c.refreshCaptcha}>
                      <RefreshCw size={16} className={captchaLoading ? "tc-login__spin" : ""} />
                      <span>{c.refreshCaptcha}</span>
                    </button>
                  </div>
                  <label className="tc-login__field tc-login__captcha-field">
                    <span className="tc-login__field-label">{c.captchaLabel}</span>
                    <span className="tc-login__input-wrap">
                      <Check size={17} aria-hidden="true" />
                      <input
                        type="text"
                        value={captchaCode}
                        onChange={(event) => onCaptchaChange(event.target.value.toUpperCase())}
                        placeholder={c.captchaPlaceholder}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={32}
                        aria-label={c.captchaLabel}
                        disabled={!challenge || captchaLoading || submitting}
                        data-testid="auth-captcha-input"
                      />
                    </span>
                  </label>
                </fieldset>

                <div className="tc-login__twofactor">
                  <button
                    className="tc-login__twofactor-toggle"
                    type="button"
                    aria-expanded={twoFactorOpen}
                    onClick={() => setTwoFactorOpen((open) => !open)}
                  >
                    <span className={`tc-login__chevron ${twoFactorOpen ? "is-open" : ""}`}><ChevronDown size={16} /></span>
                    <KeyRound size={16} aria-hidden="true" />
                    <span>{c.twoFactor}</span>
                  </button>
                  {twoFactorOpen && (
                    <label className="tc-login__field tc-login__otp">
                      <span className="tc-login__field-label">{c.twoFactorHelp}</span>
                      <span className="tc-login__input-wrap">
                        <KeyRound size={17} aria-hidden="true" />
                        <input
                          type="text"
                          inputMode="text"
                          ref={otpInputRef}
                          autoComplete="one-time-code"
                          value={otp}
                          onChange={(event) => onOtpChange(event.target.value)}
                          placeholder={c.twoFactorPlaceholder}
                          maxLength={80}
                        />
                      </span>
                    </label>
                  )}
                </div>

                {(error || languageError || captchaError) && <div className="tc-login__notice" role="alert">{error || languageError || captchaError}</div>}

                <button className="tc-login__submit" type="submit" disabled={submitting || captchaLoading || !challenge} aria-busy={submitting}>
                  <span>{submitting ? t("Signing in…") : c.submit}</span>{submitting ? <LoaderCircle size={17} className="tc-login__spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
                </button>
              </form>

              <div className="tc-login__register">
                <span>{c.invitation}</span>
                <button type="button" onClick={() => onNavigate('/register')}>{c.register}</button>
              </div>
            </div>
            <footer className="tc-login__legal">{t("Telecampaign")} <span>·</span> {t("Independent Telegram operations")}</footer>
          </section>
        </div>
        <div className="tc-login__mobile-intro" aria-hidden="true">
          <span className="tc-login__mobile-rule" />
          <p>{c.welcome}</p>
        </div>
      </div>
    </main>
  );
}
