import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useAether } from "@/hooks/use-aether";
import { Activity, ShieldCheck, Database, ArrowRight, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const { stats, loading } = useAether();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Behavior stays hidden and provable · Trades clear to and from any entity
          </p>
        </div>

        {/* Hero card, styled like the "Treasury" two-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <Card className="rounded-2xl border-border card-soft">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  Behavioral trust
                  <span className="text-[11px] font-medium text-accent-foreground bg-accent px-2 py-0.5 rounded-full">
                    Provable on demand
                  </span>
                </div>
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="w-6 h-8 rounded-md bg-muted" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Coherence scores stay private until an entity chooses to prove eligibility for a trade.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border card-soft">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  Settled volume
                  <span className="text-[11px] font-medium text-accent-foreground bg-accent px-2 py-0.5 rounded-full">
                    Visible on-chain
                  </span>
                </div>
              </div>
              <div className="text-3xl font-bold tracking-tight mb-3">
                {loading ? "—" : `${stats?.totalVolumeSettled ?? "0"} BOT`}
              </div>
              <p className="text-xs text-muted-foreground">
                Every settled Private Market Operation moves real BOT on BOT Chain testnet.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action cards row, matching "Make private" / "Prove reserves" pattern */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
          <Card className="rounded-2xl border-border card-soft">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Prove eligibility
              </div>
              <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                A counterparty can request proof that your coherence score clears their trust
                floor — verified on-chain. The real score stays private.
              </p>
              <Link href="/dashboard">
                <Button className="w-full rounded-lg bg-primary hover:bg-primary/90">
                  Launch dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border card-soft">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Database className="w-4 h-4 text-primary" />
                View contracts
              </div>
              <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                Inspect the deployed AetherOracle, AetherBDC, and AetherSettlement contracts —
                addresses, ABIs, and explorer links.
              </p>
              <Link href="/contracts">
                <Button variant="outline" className="w-full rounded-lg">
                  View contracts <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          <StatCard label="Total PMOs" value={loading ? "—" : stats?.totalPMOs || "0"} />
          <StatCard label="Settled volume" value={loading ? "—" : `${stats?.totalVolumeSettled || "0"} BOT`} />
          <StatCard label="Active entities" value="4" />
        </div>

        {/* Architecture cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Core architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <ArchCard
              icon={ShieldCheck}
              title="AetherOracle"
              desc="Ingests trading behavior to compute coherence scores (0–1000). High scores unlock protocol privileges; low scores trigger manipulation flags."
            />
            <ArchCard
              icon={Database}
              title="Behavioral debt credit"
              desc="Uncollateralized credit lines based on the Akashic depth of trading history. On-chain reputation is the collateral."
            />
            <ArchCard
              icon={Activity}
              title="PMO settlement"
              desc="Private Market Operations let coherent entities clear large trades through a commit-reveal state machine."
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl border-border card-soft">
      <CardContent className="p-6">
        <div className="text-xs font-medium text-muted-foreground mb-2">{label}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function ArchCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <Card className="rounded-2xl border-border card-soft hover:card-soft-lg transition-shadow">
      <CardContent className="p-6">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-accent-foreground" />
        </div>
        <h3 className="font-semibold mb-2 text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}
