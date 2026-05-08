import type { PostgrestError } from "@supabase/supabase-js";

export function throwIfSupabaseError(
  error: PostgrestError | null,
  context: string,
): asserts error is null {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}
