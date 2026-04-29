export interface Planogram {
  id: string;
  org_id: string;
  client_id?: string | null;
  name: string;
  category?: string | null;
  store_format?: string | null;
  source_url?: string | null;
  layout: { shelves: Array<{ index: number; capacity?: number }> };
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
}

export interface DetectedSKU {
  sku_id: string | null;
  sku_name: string;
  facings: number;
  shelf_index: number;
  bbox: [number, number, number, number];
  confidence: number;
  is_competitor: boolean;
}

export interface Recognition {
  id: string;
  capture_id: string;
  detected_skus: DetectedSKU[];
  shelf_map: { shelf_count: number };
  overall_confidence: number;
  needs_review: boolean;
  model_versions: Record<string, string>;
  processed_at: string;
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
