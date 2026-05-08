import type { Json } from "@/shared/supabase/database.types";

import type { ExportStatus } from "./export-status";

export interface Composition {
  id: string;
  videoId: string;
  exportMediaAssetId?: string | null;
  segmentOrder: Json;
  audioMediaAssetId?: string | null;
  audioSync?: Json | null;
  remotionProps?: Json | null;
  exportStatus: ExportStatus;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
