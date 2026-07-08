import { Layout } from "@/components/layout";
import { useAether } from "@/hooks/use-aether";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Zap, Layers, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function Dashboard() {
  const { entities, loading, refresh } = useAether();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Coherence dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Live observation of test entities on BOT Chain
            </p>
          </div>
          <Button
            onClick={refresh}
            disabled={loading}
            variant="outline"
            className="rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Sync data
          </Button>
        </div>

        {loading && entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-sm">Establishing uplink...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {entities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="rounded-2xl border-border card-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                PMO state pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {["PROPOSED", "COMMITTED", "REVEALED", "SETTLING", "COMPLETE"].map((state, i) => (
                  <div key={state} className="flex items-center gap-4">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        i === 4 ? "bg-primary" : "bg-muted border border-border"
                      }`}
                    />
                    <div className="flex-1 border-t border-dashed border-border" />
                    <div
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide ${
                        i === 4
                          ? "text-primary bg-accent"
                          : "text-muted-foreground bg-muted"
                      }`}
                    >
                      {state}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border card-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Akashic depth graph
              </CardTitle>
            </CardHeader>
            <CardContent>
              {entities.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
              ) : (
                <div className="h-48 flex items-end justify-between gap-3">
                  {entities.map((entity) => {
                    const depth = parseInt(entity.akashicDepth) || 0;
                    const maxDepth = Math.max(...entities.map(e => parseInt(e.akashicDepth) || 0), 1);
                    const heightPx = Math.max(8, Math.round((depth / maxDepth) * 160));
                    return (
                      <div key={entity.id} className="flex flex-col items-center gap-2 flex-1 group">
                        <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {depth}
                        </span>
                        <div
                          className="w-full rounded-t-lg bg-gradient-to-t from-primary to-violet-400 transition-all duration-700"
                          style={{ height: `${heightPx}px` }}
                        />
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {entity.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function EntityCard({ entity }: { entity: any }) {
  const score = parseInt(entity.coherence);
  const maxScore = 1000;
  const percentage = (score / maxScore) * 100;

  return (
    <Card className="rounded-2xl border-border card-soft hover:card-soft-lg transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base font-semibold mb-1">{entity.name}</CardTitle>
            <div className="text-[11px] text-muted-foreground font-mono truncate w-32" title={entity.id}>
              {entity.id.substring(0, 10)}...
            </div>
          </div>
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
              entity.isEligible
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {entity.isEligible && <CheckCircle2 className="w-3 h-3" />}
            {entity.isEligible ? "Eligible" : "Flagged"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 grid gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Coherence</span>
            <span className="font-semibold">{score} / 1000</span>
          </div>
          <Progress value={percentage} className="h-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-muted rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground mb-1">BDC limit</div>
            <div className="text-sm font-semibold flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" />
              {entity.creditLimit}
            </div>
          </div>
          <div className="bg-muted rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground mb-1">Volatility</div>
            <div className="text-sm font-semibold flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary" />
              {entity.volatility}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
