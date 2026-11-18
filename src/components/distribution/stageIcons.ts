// The icon for a route-to-market stage (Control Tower spine, Network Setup). Stages carry a legacy emoji `icon` string
// that is stored server-side and saved back unchanged; the UI draws a lucide icon chosen from the stage's key / entity
// instead, so the spine and the setup list always show the same glyph for the same stage.

import type { LucideIcon } from 'lucide-react';
import { Building2, CircleDot, Factory, Package, Store, Truck, Users, Warehouse, Wrench } from 'lucide-react';

const BY_KEY: Record<string, LucideIcon> = {
  brand: Factory,
  distributor: Truck,
  retailer: Store,
  consumer: Users,
  super_stockist: Warehouse,
  wholesaler: Package,
  sub_distributor: Truck,
  fabricator: Wrench,
  modern_trade: Building2,
};

const BY_ENTITY: Record<string, LucideIcon> = {
  brand: Factory,
  distributor: Truck,
  outlet: Store,
  retailer: Store,
  consumer: Users,
};

export function stageIcon(stage: { key: string; entity?: string | null }): LucideIcon {
  return BY_KEY[stage.key] || (stage.entity ? BY_ENTITY[stage.entity] : undefined) || CircleDot;
}
