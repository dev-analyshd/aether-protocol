import { Layout } from "@/components/layout";
import { AETHER_ORACLE_ADDRESS, AETHER_BDC_ADDRESS, AETHER_SETTLEMENT_ADDRESS, RPC_URL, CHAIN_ID } from "@/hooks/use-aether";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, ExternalLink, Network, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const CONTRACTS = [
  {
    name: "AetherOracle",
    address: AETHER_ORACLE_ADDRESS,
    description: "Computes coherence scores and detects market manipulation.",
    abi: [
      "getCoherence(bytes32 entityId)",
      "isManipulationPair(bytes32 entityA, bytes32 entityB)"
    ]
  },
  {
    name: "AetherBDC",
    address: AETHER_BDC_ADDRESS,
    description: "Manages Behavioral Debt Credit limits based on Akashic depth.",
    abi: [
      "getCreditLimit(bytes32 entityId)",
      "getAkashicDepth(bytes32 entityId)"
    ]
  },
  {
    name: "AetherSettlement",
    address: AETHER_SETTLEMENT_ADDRESS,
    description: "Executes Private Market Operations state machine.",
    abi: [
      "getPMO(bytes32 pmoId)",
      "totalPMOs()",
      "completedPMOs()",
      "totalVolumeSettled()"
    ]
  }
];

export default function Contracts() {
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${label} address copied.`,
      className: "rounded-xl",
    });
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Network contracts</h1>
            <p className="text-muted-foreground text-sm">Core infrastructure deployed on BOT Chain</p>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-white border border-border rounded-xl px-4 py-2.5 card-soft">
              <Network className="w-4 h-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground">Chain ID</div>
                <div className="font-semibold text-sm">{CHAIN_ID}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white border border-border rounded-xl px-4 py-2.5 card-soft">
              <Network className="w-4 h-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground">RPC node</div>
                <div className="font-semibold text-sm truncate max-w-[140px]">{RPC_URL}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {CONTRACTS.map((contract) => (
            <Card key={contract.name} className="rounded-2xl border-border card-soft hover:card-soft-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center mb-3">
                  <Code className="w-4 h-4 text-accent-foreground" />
                </div>
                <CardTitle className="text-base font-semibold">
                  {contract.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1.5 min-h-[36px] leading-relaxed">{contract.description}</p>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-xl p-3 flex items-center justify-between mb-5">
                  <div className="font-mono text-xs truncate max-w-[190px] text-foreground/80">{contract.address}</div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-white"
                      onClick={() => copyToClipboard(contract.address, contract.name)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-white"
                      onClick={() => window.open(`https://scan.bohr.life/address/${contract.address}`, '_blank')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground mb-2.5">Read functions (ABI)</div>
                  <div className="space-y-1.5">
                    {contract.abi.map((func, i) => (
                      <div key={i} className="font-mono text-[11px] bg-muted/60 rounded-lg p-2 text-foreground/70 break-all">
                        {func}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
