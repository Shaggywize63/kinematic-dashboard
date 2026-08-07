export type PriceSource = 'shelf_tag' | 'on_pack' | 'promo';
export type ShelfZone = 'low' | 'eye' | 'top';
export type OfferType = 'price_off' | 'bundle' | 'bogo' | 'combo' | 'other';
/** Metrics the backend documents a formula for in `Compliance.methodology`. */
export type MethodologyKey =
  | 'occupancy'
  | 'shelf_share'
  | 'zone'
  | 'facing'
  | 'position'
  | 'presence'
  | 'composite';

export interface Planogram {
  id: string;
  org_id: string;
  client_id?: string | null;
  name: string;
  category?: string | null;
  store_format?: string | null;
  source_url?: string | null;
  layout: {
    shelves: Array<{ index: number; capacity?: number }>;
    /** Tracked competitor SKUs, matched against explicitly at capture time. */
    competitors?: PlanogramCompetitor[];
    category_definition?: string;
  };
  expected_skus: Array<ExpectedSKU>;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpectedSKU {
  sku_id: string;
  sku_name: string;
  shelf_index: number;
  facings: number;
  position?: number;
  weight?: number;
  /** Category bucket used for category-wise analysis (Beverages, Noodles…). */
  category?: string | null;
  brand?: string | null;
  /** MRP / list price used to compute pricing deltas against the shelf. */
  expected_price?: number | null;
  /** Front-of-pack reference shot; shelf-recognition matches products against it. */
  ref_image_url?: string | null;
}

/** A tracked competitor SKU stored on `planogram.layout.competitors`. */
export interface PlanogramCompetitor {
  sku_id: string;
  sku_name: string;
  brand?: string | null;
  category?: string | null;
  expected_price?: number | null;
  ref_image_url?: string | null;
}

export interface DetectedSKU {
  sku_id: string | null;
  sku_name: string;
  brand?: string | null;
  category?: string | null;
  facings: number;
  shelf_index: number;
  /** Vertical placement band on the fixture. */
  zone?: ShelfZone | null;
  bbox: [number, number, number, number];
  /** Fraction (0..1) of the shelf image occupied by this box, when computed. */
  bbox_area?: number | null;
  price?: number | null;
  price_currency?: string | null;
  price_source?: PriceSource | null;
  confidence: number;
  is_competitor: boolean;
  reasoning?: string | null;
}

/** A promotion / offer detected on the shelf image. */
export interface Promotion {
  text: string;
  offer_type: OfferType;
  bbox?: [number, number, number, number] | null;
  confidence: number;
  linked_sku_ids: string[];
}

export interface Recognition {
  id: string;
  capture_id: string;
  detected_skus: DetectedSKU[];
  promotions?: Promotion[];
  shelf_map: { shelf_count: number };
  overall_confidence: number;
  needs_review: boolean;
  model_versions: Record<string, string>;
  processed_at: string;
}

/** Per-category rollup for category-wise shelf analysis. */
export interface CategoryBreakdown {
  category: string;
  occupancy: number;
  own_share: number;
  competitor_share: number;
  facings: number;
  sku_count: number;
  avg_own_price: number | null;
  avg_competitor_price: number | null;
}

/** Own vs competitor facings within a placement band (low / eye / top). */
export interface ZoneBreakdown {
  zone: ShelfZone;
  own_facings: number;
  competitor_facings: number;
  own_share: number;
  sku_ids: string[];
}

/** A single pricing observation (own SKU vs expected, or competitor). */
export interface PricingRow {
  sku_id: string | null;
  sku_name: string;
  is_competitor: boolean;
  price: number | null;
  currency: string | null;
  expected_price: number | null;
  delta: number | null;
  source: PriceSource | null;
  confidence: number;
}

/** Promotion carried on the compliance record (rolled up from recognition). */
export interface CompliancePromotion {
  text: string;
  offer_type: OfferType;
  confidence: number;
  linked_sku_ids: string[];
}

/** How a metric was computed — surfaced in the methodology popovers. */
export interface MethodologyEntry {
  formula: string;
  inputs: string[];
  notes?: string;
}

export interface Compliance {
  id: string;
  capture_id: string;
  planogram_id: string;
  store_id?: string | null;
  fe_id?: string | null;
  score: number;
  presence_score: number;
  facing_score: number;
  position_score: number;
  competitor_share: number;
  /** New: share of shelf occupied by product at all (0..100). */
  occupancy_score?: number;
  /** New: own vs competitor share of shelf space (0..100 each). */
  shelf_share_own?: number;
  shelf_share_competitor?: number;
  missing_skus: Array<{ sku_id: string; sku_name: string; expected_facings: number }>;
  misplaced_skus: Array<{
    sku_id: string;
    sku_name: string;
    expected_shelf: number;
    actual_shelf: number;
  }>;
  facing_deltas: Array<{
    sku_id: string;
    sku_name: string;
    expected: number;
    actual: number;
    delta: number;
  }>;
  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    action: string;
    sku_id?: string;
    sku_name?: string;
    rationale: string;
  }>;
  /** New: per-category rollups (Beverages, Noodles…). */
  category_breakdown?: CategoryBreakdown[];
  /** New: placement-band rollups (low / eye-level / top). */
  zone_breakdown?: ZoneBreakdown[];
  /** New: pricing observations (own vs expected, competitors). */
  pricing?: PricingRow[];
  /** New: detected promotions rolled up from recognition. */
  promotions?: CompliancePromotion[];
  /** New: per-metric formula + inputs for the methodology popovers. */
  methodology?: Partial<Record<MethodologyKey, MethodologyEntry>>;
  created_at: string;
}

export interface Capture {
  id: string;
  org_id: string;
  fe_id: string;
  store_id?: string | null;
  planogram_id: string;
  image_url: string;
  capture_lat?: number | null;
  capture_lng?: number | null;
  angle_score?: number;
  blur_score?: number;
  glare_score?: number;
  captured_at: string;

  // Joined
  fe?: { name: string };
  store?: { name: string };
  planogram?: { name: string };
  compliance?: { score: number };
}

export interface TrendPoint {
  day: string;
  avg_score: number;
  captures: number;
}

export interface StoreRanking {
  bucket: string;
  bucket_label: string;
  captures: number;
  avg_score: number;
  avg_presence: number;
  avg_facing: number;
  avg_position: number;
  competitor_share: number;
}

export interface ChronicGap {
  store_id: string;
  failing: number;
  avg_score: number;
}

export interface SkuVisibility {
  sku_id: string;
  sku_name: string;
  avg_facings: number;
  appearances: number;
}

export interface RiskForecastRow {
  store_id: string;
  latest: number;
  slope: number;
  risk: number;
}
