export type PriceSource = 'shelf_tag' | 'on_pack' | 'promo';
export type ShelfZone = 'low' | 'eye' | 'top';
export type OfferType = 'price_off' | 'bundle' | 'bogo' | 'combo' | 'other';
/** Metrics the backend documents a formula for in `Compliance.methodology`. */
export type MethodologyKey =
  | 'occupancy'
  | 'shelf_share'
  | 'zone'
  | 'category'
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
  /** Extra reference pack-shots grown over time by confirming correct shelf
   *  detections (self-improving recognition). Optional — older data lacks it. */
  additional_ref_urls?: string[];
}

/** A tracked competitor SKU stored on `planogram.layout.competitors`. */
export interface PlanogramCompetitor {
  sku_id: string;
  sku_name: string;
  brand?: string | null;
  category?: string | null;
  expected_price?: number | null;
  ref_image_url?: string | null;
  /** Extra reference pack-shots grown over time by confirming correct shelf
   *  detections (self-improving recognition). Optional — older data lacks it. */
  additional_ref_urls?: string[];
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
  /** True when the first vision pass missed this SKU but a second targeted pass
   *  recovered it (it WAS on the shelf). Absent/false = a normal first-pass find.
   *  Older recognitions predate the recall pass and never carry it. */
  recovered?: boolean;
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
  /** Matched competitor identity, when the row is a competitor observation.
   *  Optional — older pricing rows predate brand matching. */
  brand?: string | null;
}

/** Promotion carried on the compliance record (rolled up from recognition). */
export interface CompliancePromotion {
  text: string;
  offer_type: OfferType;
  confidence: number;
  linked_sku_ids: string[];
}

/** How a metric was computed — surfaced in the methodology explainers.
 *  `formula`/`inputs`/`notes` are always present; the remaining fields are the
 *  auditable extras (real numbers + per-SKU table). Older captures only carry
 *  `formula`/`inputs`, so every extra is optional and must render fine absent. */
export interface MethodologyEntry {
  formula: string;
  inputs: string[];
  notes?: string;
  /** Composite contribution weight (presence 0.5, facing 0.25, position 0.2, competitor -0.05). */
  weight?: number;
  /** The computed metric value, 0..100. */
  result?: number;
  /** The actual arithmetic WITH real numbers, e.g. `present weight 20 / total weight 32 × 100 = 62.5`. */
  calc?: string;
  /** Header for the audit table. */
  columns?: { key: string; label: string }[];
  /** Per-SKU rows, each keyed by `columns[].key`. */
  rows?: Array<Record<string, string | number | boolean | null>>;
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
  /** Trial / storeless captures: manually-entered outlet name + device info. */
  device_meta?: { outlet_label?: string | null; platform?: string | null } | null;

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

// ── Insights (cross-store trend analytics) ──────────────────────────────────
// Response of GET /api/v1/planograms/analytics/insights. Every series degrades
// to empty on sparse data, so the page renders graceful empty states.

export interface InsightsTrendPoint {
  date: string;
  avg_score: number;
  captures: number;
}
export interface InsightsCategoryShare {
  category: string;
  own_share: number;
  competitor_share: number;
  facings: number;
  captures: number;
  avg_own_price: number | null;
  avg_competitor_price: number | null;
}
export interface InsightsPricePoint {
  date: string;
  own_avg_price: number | null;
  competitor_avg_price: number | null;
  own_n: number;
  competitor_n: number;
}
export interface InsightsStoreRow {
  store_id: string;
  store_name: string | null;
  region: string | null;
  captures: number;
  avg_score: number;
  own_shelf_share: number | null;
  competitor_share: number | null;
}
export interface InsightsRegionRow {
  region: string;
  stores: number;
  captures: number;
  avg_score: number;
  own_shelf_share: number | null;
}
export interface InsightsPromo {
  captures_total: number;
  captures_with_promo: number;
  pct: number;
  trend: Array<{ date: string; total: number; with_promo: number; pct: number }>;
  top_offers: Array<{ text: string; offer_type: string; count: number }>;
}
export interface PlanogramInsights {
  period_days: number;
  captures_count: number;
  stores_count: number;
  compliance_trend: InsightsTrendPoint[];
  category_share: InsightsCategoryShare[];
  price_movement: InsightsPricePoint[];
  store_compliance: InsightsStoreRow[];
  region_compliance: InsightsRegionRow[];
  promo: InsightsPromo;
}

// ── Redesigned module: Overview + Captures list contracts ───────────────────
// These mirror the pinned backend contract for the new planogram module shell.
// Every field is optional/nullable so the UI degrades gracefully while the
// backend endpoints are being built out (they can be sparse or absent).

/** One point on the Overview compliance-trend mini chart. */
export interface OverviewTrendPoint {
  date: string;
  avg_score: number;
}

/** A low-scoring / flagged capture surfaced in the Overview "Needs attention". */
export interface NeedsAttentionItem {
  capture_id: string;
  store_name?: string | null;
  score?: number | null;
  reason?: string | null;
}

/** A row in the Overview "Recent captures" table. */
export interface OverviewRecentItem {
  capture_id: string;
  store_name?: string | null;
  category?: string | null;
  captured_at: string;
  score?: number | null;
  recovered_count?: number | null;
  needs_review?: boolean;
  competitor_present?: boolean;
}

/** Response of GET /api/v1/planograms/overview. */
export interface PlanogramOverview {
  avg_compliance?: number | null;
  own_shelf_share?: number | null;
  captures_count?: number | null;
  stores_count?: number | null;
  flagged_count?: number | null;
  trend?: OverviewTrendPoint[];
  needs_attention?: NeedsAttentionItem[];
  recent?: OverviewRecentItem[];
}

/** A row in the Captures list / Review queue tables. */
export interface CaptureListItem {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  /** Free-trial / storeless captures carry the rep's manually-entered outlet
   *  name here (from device_meta.outlet_label) so the list can name the outlet
   *  even though there is no server store. */
  outlet_label?: string | null;
  city?: string | null;
  category?: string | null;
  captured_at: string;
  fe_name?: string | null;
  score?: number | null;
  presence_score?: number | null;
  shelf_share_own?: number | null;
  needs_review?: boolean;
  recovered_count?: number | null;
  competitor_present?: boolean;
}

/** Normalized response of GET /api/v1/planograms/captures. */
export interface CapturesListResponse {
  total: number;
  captures: CaptureListItem[];
}

/** Filters accepted by the captures list endpoint. */
export interface CaptureListParams {
  city?: string;
  store_id?: string;
  needs_review?: boolean;
  min_score?: number;
  max_score?: number;
  limit?: number;
  offset?: number;
}

/** Body for POST /api/v1/planograms/captures/:id/detection-feedback (next phase). */
export interface DetectionFeedbackBody {
  sku_id?: string;
  bbox?: number[];
  reason: string;
  correct_sku_id?: string;
  note?: string;
}
