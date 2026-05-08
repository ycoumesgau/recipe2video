export type MediaAssetStatus =
  | "pending"
  | "stored"
  | "uploaded_to_mux"
  | "failed"
  | "deleted"
  | "archived";

export interface RecipeSourceMediaAssetInput {
  id: string;
  videoId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  fileSizeBytes: number;
}
