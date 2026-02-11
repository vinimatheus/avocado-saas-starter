import { Clock3Icon, MapPinnedIcon, PackageIcon, PackageSearchIcon, ScanLineIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatsOverviewProps = {
  stats: {
    locationCount: number;
    palletCount: number;
    productCount: number;
    recordCount: number;
    latestRecordAt: Date | null;
  };
};

function formatDate(value: Date | null): string {
  if (!value) {
    return "Sem registros";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinnedIcon />
            Localizacoes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{stats.locationCount}</div>
          <Badge variant="outline">Base cadastrada</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageIcon />
            Pallets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{stats.palletCount}</div>
          <Badge variant="outline">Base cadastrada</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageSearchIcon />
            Produtos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{stats.productCount}</div>
          <Badge variant="outline">Base cadastrada</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLineIcon />
            Registros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{stats.recordCount}</div>
          <Badge variant="secondary">Manual + Python</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3Icon />
            Ultima leitura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm font-medium">{formatDate(stats.latestRecordAt)}</div>
          <Badge variant="outline">Horario local</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
