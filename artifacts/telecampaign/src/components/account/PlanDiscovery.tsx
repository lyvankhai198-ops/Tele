import { LockKeyhole, MoveRight } from "lucide-react";
import { Link } from "wouter";
import { TierEmblem } from "./TierEmblem";
import { useLanguage, interfaceText } from "@/lib/i18n";
import "./upgrade.css";

/** Navigation only: owning a lower tier never grants the advertised tier. */
export function PlanDiscovery({ plan }: { plan: string }) {
  const { language } = useLanguage();
  const tiers = plan === "plus" ? ["pro", "unlimited"] : plan === "pro" ? ["unlimited"] : [];
  if (!tiers.length) return null;
  return (
    <section className="tc-discovery" aria-labelledby="higher-plans-title">
      <div className="discovery-heading">
        <h2 id="higher-plans-title">{interfaceText("Upgrade plan", language)}</h2>
      </div>
      <div className="discovery-grid">
        {tiers.map((tier) => (
          <Link key={tier} href={`/upgrade?plan=${tier}`} className="discovery-card" data-tier={tier}
            data-testid={`discover-plan-${tier}`}>
            <span className="discovery-lock"><LockKeyhole size={13} aria-hidden="true" /></span>
            <span className="discovery-info">
              <strong>{tier.toUpperCase()}</strong>
              <span>{interfaceText("View details", language)}</span>
            </span>
            <TierEmblem tier={tier} />
            <MoveRight size={13} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
