import { useState } from "react";
import { Check, KeyRound, MoreHorizontal, Plus, Radio, ShieldCheck } from "lucide-react";
import { AppLayout, Input, Modal, PageIntro, Panel, PrimaryButton, QuietButton, SectionHeader, StatusBadge, Toast } from "./_shared/AppLayout";

const initialAccounts = [
  { id: 1, name: "Minh · primary", handle: "@minh_ops", phone: "+84 ••• ••• 218", groups: 7, last: "Active now", status: "connected" as const, color: "bg-[#1d5279] text-[#b8e4ff]" },
  { id: 2, name: "TeleCampaign Bot", handle: "@telecampaign_helper", phone: "Bot account", groups: 4, last: "Active 4 min ago", status: "connected" as const, color: "bg-[#5b452b] text-[#f1cc91]" },
  { id: 3, name: "Community backup", handle: "@community_backup", phone: "+84 ••• ••• 904", groups: 3, last: "Re-auth required", status: "warning" as const, color: "bg-[#3d395a] text-[#c4b9ef]" },
];

export function Accounts() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function closeModal() { setShowModal(false); setStep(1); setPhone(""); }
  function addDemoAccount() {
    setAccounts((current) => [...current, { id: 4, name: "New Telegram account", handle: "@pending_account", phone: phone || "Phone not added", groups: 0, last: "Just added", status: "connected" as const, color: "bg-[#2c524a] text-[#a8e3c9]" }]);
    closeModal();
    setToast("Account added to your workspace");
  }

  return (
    <AppLayout activePage="accounts" title="Accounts" subtitle="Managed identities and connection health" headerAction={<QuietButton onClick={() => setShowModal(true)}><Plus className="h-3.5 w-3.5" />Add account</QuietButton>}>
      <PageIntro kicker="Identity & access" heading="Telegram accounts" detail="Connect only accounts you already manage. TeleCampaign never requests or stores a login code in this workspace." action={<PrimaryButton onClick={() => setShowModal(true)}><Plus className="h-4 w-4" />Add Telegram account</PrimaryButton>} />
      <Panel className="mb-6 flex flex-col gap-4 border-[#315475] bg-[#112a40] p-4 sm:flex-row sm:items-center sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1b5079] text-[#8fd2ff]"><ShieldCheck className="h-5 w-5" /></span>
        <div className="flex-1"><p className="text-[13px] font-semibold text-[#d6eafa]">Permission-first by default</p><p className="mt-1 text-[12px] leading-5 text-[#85a9c6]">Each account is scoped to the channels you explicitly approve. No auto-join, discovery, or unsolicited messaging actions are available.</p></div>
        <button onClick={() => setToast("Security policy copied to clipboard")} className="shrink-0 rounded-lg border border-[#315575] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#7fc7f5] hover:bg-[#173a56]">View policy</button>
      </Panel>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[["3", "Connected identities", "1 needs attention"], ["14", "Approved destinations", "Across all accounts"], ["98.7%", "Connection uptime", "Last 30 days"]].map(([value, label, detail], index) => <Panel key={label} className="p-5"><p className={`text-[26px] font-semibold tracking-[-0.04em] ${index === 2 ? "text-[#7ed7a7]" : "text-[#e6f1f8]"}`}>{value}</p><p className="mt-2 text-[12px] font-medium text-[#bdd0df]">{label}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#69849d]">{detail}</p></Panel>)}
      </div>
      <Panel className="overflow-hidden">
        <div className="border-b border-[#24384d] p-5 sm:p-6"><SectionHeader eyebrow="Managed identities" title="Connected accounts" detail="Use a separate identity when a team or community requires it." /></div>
        <div className="divide-y divide-[#21364a]">
          {accounts.map((account) => <div key={account.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:px-6"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${account.color}`}>{account.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-semibold text-[#deebf4]">{account.name}</p><StatusBadge status={account.status === "warning" ? "warning" : "connected"} label={account.status === "warning" ? "Attention" : "Connected"} /></div><p className="mt-1 text-[11px] text-[#728da6]">{account.handle} · {account.phone}</p></div><div className="grid grid-cols-2 gap-6 sm:flex sm:items-center sm:gap-10"><div><p className="font-mono text-[13px] text-[#d9e8f3]">{account.groups}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#668099]">Destinations</p></div><div><p className="text-[11px] text-[#a5bacb]">{account.last}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#668099]">Last check</p></div><button onClick={() => setToast(`${account.name} settings opened`)} className="rounded-lg p-2 text-[#7893aa] hover:bg-[#192e41] hover:text-[#deedf7]" aria-label={`Open ${account.name} menu`}><MoreHorizontal className="h-4 w-4" /></button></div></div>)}
        </div>
      </Panel>
      {showModal && <Modal title={step === 1 ? "Add a Telegram account" : "Account ready to connect"} description={step === 1 ? "Use Telegram’s official sign-in flow. We will never ask you to paste a session string or verification code here." : "Your integration settings are present. Continue only if this identity is yours to operate."} onClose={closeModal}>
        {step === 1 ? <div className="space-y-5"><div className="rounded-xl border border-[#6a5032] bg-[#302719] p-4 text-[12px] leading-5 text-[#e3c18f]"><div className="mb-1 flex items-center gap-2 font-semibold text-[#f0cf9e]"><KeyRound className="h-4 w-4" />Safe connection flow</div>Telegram will open a separate authentication step. Never share a code with anyone, including support.</div><Input label="Phone number (optional)" value={phone} onChange={setPhone} placeholder="+84 90 000 0000" /><div className="flex justify-end gap-2"><QuietButton onClick={closeModal}>Cancel</QuietButton><PrimaryButton onClick={() => setStep(2)}>Continue securely</PrimaryButton></div></div> : <div className="space-y-5"><div className="space-y-3 rounded-xl border border-[#2a465b] bg-[#0e1b29] p-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1b5079] text-[#8fd2ff]"><Radio className="h-4 w-4" /></span><div><p className="text-[12px] font-semibold text-[#dcecf6]">Telegram integration</p><p className="font-mono text-[10px] text-[#7090ab]">Ready for account authorization</p></div><Check className="ml-auto h-4 w-4 text-[#76d19d]" /></div></div><p className="text-[12px] leading-5 text-[#829ab0]">After authorization, you can review destination permissions before any post is scheduled.</p><div className="flex justify-end gap-2"><QuietButton onClick={() => setStep(1)}>Back</QuietButton><PrimaryButton onClick={addDemoAccount}>Connect account</PrimaryButton></div></div>}
      </Modal>}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}