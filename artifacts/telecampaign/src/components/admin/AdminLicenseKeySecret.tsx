import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { getAdminLicenseKeySecret } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { Clipboard, Eye, EyeOff, LoaderCircle } from "lucide-react";

type Props = { licenseKeyId: string };
type ClipboardGate = {
  promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (reason?: unknown) => void;
};

function createClipboardGate(): ClipboardGate {
  let resolve!: (blob: Blob) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Blob>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

export function AdminLicenseKeySecret({ licenseKeyId }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();
  const search = useSearch();
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<"view" | "copy" | null>(null);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const rejectClipboardRef = useRef<(() => void) | null>(null);
  const sessionSignature = `${user?.id ?? "anonymous"}:${user?.role ?? "none"}:${user?.support?.targetUserId ?? "standard"}`;
  const activeSession = useRef(sessionSignature);
  const currentSession = useRef(sessionSignature);
  const routeSignature = `${location}?${search}`;
  const currentRoute = useRef(routeSignature);
  currentSession.current = sessionSignature;
  currentRoute.current = routeSignature;
  const vi = language === "vi";

  const abortPending = useCallback(() => {
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    rejectClipboardRef.current?.();
    rejectClipboardRef.current = null;
    setBusy(null);
  }, []);

  const clearSecret = useCallback(() => {
    abortPending();
    setSecret(null);
  }, [abortPending]);

  useLayoutEffect(() => {
    if (activeSession.current !== sessionSignature) {
      activeSession.current = sessionSignature;
      clearSecret();
      setMessage("");
    }
  }, [sessionSignature, clearSecret]);

  useLayoutEffect(() => {
    clearSecret();
    setMessage("");
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      controller.current = null;
      rejectClipboardRef.current?.();
      rejectClipboardRef.current = null;
    };
  }, [licenseKeyId, location, search, clearSecret]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        clearSecret();
        setMessage("");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearSecret]);

  const operationIsCurrent = (token: number, session: string, route: string, signal?: AbortSignal) =>
    token === sequence.current
    && !signal?.aborted
    && document.visibilityState === "visible"
    && currentSession.current === session
    && currentRoute.current === route;

  const requestSecret = async (signal: AbortSignal) => getAdminLicenseKeySecret(licenseKeyId, {
    signal,
    credentials: "include",
    cache: "no-store",
  });

  function beginClipboardWrite(blobPromise: Promise<Blob>): Promise<void> {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      throw new Error("clipboard-unsupported");
    }
    return navigator.clipboard.write([
      new ClipboardItem({ "text/plain": blobPromise }),
    ]);
  }

  function beginClipboardWriteText(text: string): Promise<void> {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      return navigator.clipboard.write([
        new ClipboardItem({ "text/plain": Promise.resolve(new Blob([text], { type: "text/plain" })) }),
      ]);
    }
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    throw new Error("clipboard-unsupported");
  }

  async function revealOrCancel() {
    if (busy) {
      clearSecret();
      setMessage("");
      return;
    }
    if (secret) {
      clearSecret();
      setMessage("");
      return;
    }

    abortPending();
    const token = ++sequence.current;
    const session = currentSession.current;
    const route = currentRoute.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("view");
    setMessage("");
    try {
      const response = await requestSecret(abort.signal);
      if (!operationIsCurrent(token, session, route, abort.signal)) return;
      setSecret(response.licenseKey);
    } catch (error) {
      if (!operationIsCurrent(token, session, route, abort.signal)) return;
      const status = (error as { status?: number })?.status;
      setMessage(status === 409
        ? (vi ? "Không thể khôi phục key gốc này. Dữ liệu mã hóa cũ không còn khả dụng." : "This original key cannot be recovered. Its legacy encrypted value is unavailable.")
        : (vi ? "Không thể tải key. Hãy kiểm tra quyền quản trị và thử lại." : "Could not retrieve the key. Check admin access and try again."));
    } finally {
      if (token === sequence.current) {
        controller.current = null;
        setBusy(null);
      }
    }
  }

  async function copyExistingSecret() {
    if (busy) return;
    const session = currentSession.current;
    const route = currentRoute.current;
    const token = ++sequence.current;
    setMessage("");
    let clipboardWrite: Promise<void>;
    try {
      clipboardWrite = beginClipboardWriteText(secret ?? "");
    } catch {
      setMessage(vi ? "Clipboard không khả dụng trên trình duyệt này." : "Clipboard access is unavailable in this browser.");
      return;
    }
    setBusy("copy");
    try {
      await clipboardWrite;
      if (operationIsCurrent(token, session, route)) {
        setMessage(vi ? "Đã sao chép key." : "Key copied.");
      }
    } catch {
      if (operationIsCurrent(token, session, route)) {
        setMessage(vi ? "Không thể sao chép. Hãy cho phép quyền clipboard rồi thử lại." : "Could not copy. Allow clipboard access and try again.");
      }
    } finally {
      if (token === sequence.current) setBusy(null);
    }
  }

  async function fetchAndCopyHiddenSecret() {
    if (busy) return;
    abortPending();
    const token = ++sequence.current;
    const session = currentSession.current;
    const route = currentRoute.current;
    const abort = new AbortController();
    const gate = createClipboardGate();
    controller.current = abort;
    rejectClipboardRef.current = () => gate.reject(new Error("operation-cancelled"));

    let clipboardWrite: Promise<void>;
    try {
      // Start writing while the original click still has transient user activation.
      clipboardWrite = beginClipboardWrite(gate.promise);
    } catch {
      gate.reject(new Error("clipboard-unsupported"));
      controller.current = null;
      rejectClipboardRef.current = null;
      setMessage(vi ? "Clipboard không khả dụng trên trình duyệt này." : "Clipboard access is unavailable in this browser.");
      return;
    }
    let clipboardRejected = false;
    let payloadRejected = false;
    const clipboardFinished = clipboardWrite.then(
      () => true,
      () => {
        if (!payloadRejected && !abort.signal.aborted) {
          clipboardRejected = true;
          abort.abort();
        }
        return false;
      },
    );
    setBusy("copy");
    setMessage("");

    try {
      let ephemeralKey = (await requestSecret(abort.signal)).licenseKey;
      if (!operationIsCurrent(token, session, route, abort.signal) || clipboardRejected) {
        ephemeralKey = "";
        if (clipboardRejected && operationIsCurrent(token, session, route)) {
          setMessage(vi ? "Không thể sao chép. Hãy cho phép quyền clipboard rồi thử lại." : "Could not copy. Allow clipboard access and try again.");
        }
        return;
      }
      try {
        gate.resolve(new Blob([ephemeralKey], { type: "text/plain" }));
      } finally {
        ephemeralKey = "";
      }
      const copied = await clipboardFinished;
      if (!operationIsCurrent(token, session, route)) return;
      setMessage(copied
        ? (vi ? "Đã sao chép key." : "Key copied.")
        : (vi ? "Không thể sao chép. Hãy cho phép quyền clipboard rồi thử lại." : "Could not copy. Allow clipboard access and try again."));
    } catch (error) {
      payloadRejected = true;
      gate.reject(error);
      const copied = await clipboardFinished;
      if (!operationIsCurrent(token, session, route)) return;
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        setMessage(vi ? "Không thể khôi phục key gốc này. Dữ liệu mã hóa cũ không còn khả dụng." : "This original key cannot be recovered. Its legacy encrypted value is unavailable.");
      } else if (clipboardRejected || !copied && abort.signal.aborted) {
        setMessage(vi ? "Không thể sao chép. Hãy cho phép quyền clipboard rồi thử lại." : "Could not copy. Allow clipboard access and try again.");
      } else {
        setMessage(vi ? "Không thể tải key để sao chép. Hãy kiểm tra quyền quản trị và thử lại." : "Could not retrieve the key to copy. Check admin access and try again.");
      }
    } finally {
      if (token === sequence.current) {
        controller.current = null;
        rejectClipboardRef.current = null;
        setBusy(null);
      }
    }
  }

  function copyHiddenOrVisible() {
    if (busy) return;
    if (secret) void copyExistingSecret();
    else void fetchAndCopyHiddenSecret();
  }

  return (
    <div className="space-y-2" data-testid={`license-secret-${licenseKeyId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void revealOrCancel()} aria-expanded={Boolean(secret)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbdbe6] bg-white px-3 py-2 text-xs font-bold text-[#21475f] hover:bg-[#f2f7fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147da3]"
          data-testid={`button-reveal-license-${licenseKeyId}`}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {busy ? (vi ? "Hủy thao tác" : "Cancel") : secret ? (vi ? "Ẩn key" : "Hide key") : (vi ? "Xem key" : "View key")}
        </button>
        <button type="button" onClick={copyHiddenOrVisible} disabled={Boolean(busy)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbdbe6] bg-white px-3 py-2 text-xs font-bold text-[#21475f] hover:bg-[#f2f7fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147da3] disabled:cursor-wait disabled:opacity-60"
          data-testid={`button-copy-license-${licenseKeyId}`}>
          {busy === "copy" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
          {vi ? "Sao chép" : "Copy"}
        </button>
      </div>
      {secret && <code className="block max-w-full select-text break-all rounded-lg border border-[#d6e4eb] bg-[#f6fafc] px-3 py-2 font-mono text-sm leading-6 text-[#16394f]" data-testid={`text-license-secret-${licenseKeyId}`}>{secret}</code>}
      {message && <p role="status" className="max-w-prose text-xs font-medium text-[#76521e]">{message}</p>}
    </div>
  );
}
