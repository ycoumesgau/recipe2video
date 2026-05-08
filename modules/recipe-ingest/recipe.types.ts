export type RecipeSourceType = "url" | "photos" | "text" | "demo_fixture";

export interface RecipeIngredient {
  name: string;
  quantity?: string | null;
  note?: string | null;
}

export interface RecipeStep {
  position: number;
  text: string;
  timing?: string | null;
  visualCue?: string | null;
}

export interface RecipeData {
  title: string;
  sourceType: RecipeSourceType;
  sourceUrl?: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  timing?: {
    prep?: string | null;
    cook?: string | null;
    total?: string | null;
  } | null;
  criticalTransformations: string[];
  visualTextureOpportunities: string[];
  possibleHooks: string[];
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  reason: string;
}

export interface RecipeAnalysisInput {
  videoId: string;
  sourceType: RecipeSourceType;
  recipeText?: string | null;
  recipeUrl?: string | null;
  photoDescriptions?: string[];
  requestedByUserId: string;
  isAllowlisted: boolean;
}

export interface RecipeAnalysisResult {
  recipe: RecipeData;
  clarifyingQuestions: ClarifyingQuestion[];
}
