import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { tryCreateLibraryStorageSignedUrl } from "./create-library-storage-signed-url";

function fakeSupabase(pathsThatSign: Set<string>): SupabaseDataClient {
  return {
    storage: {
      from() {
        return {
          createSignedUrl(path: string) {
            if (pathsThatSign.has(path)) {
              return Promise.resolve({
                data: { signedUrl: `https://signed.test/${path}` },
                error: null,
              });
            }
            return Promise.resolve({
              data: null,
              error: { message: "Object not found" },
            });
          },
        };
      },
    },
  } as unknown as SupabaseDataClient;
}

test("tryCreateLibraryStorageSignedUrl uses legacy spatula path when primary is missing", async () => {
  const supabase = fakeSupabase(
    new Set(["library/utensil/spatula.png"]),
  );

  const url = await tryCreateLibraryStorageSignedUrl(supabase, {
    bucket: "reference-images",
    path: "library/utensil/silicone_spatula.png",
    libraryCanonicalName: "silicone_spatula",
  });

  assert.equal(url, "https://signed.test/library/utensil/spatula.png");
});

test("tryCreateLibraryStorageSignedUrl prefers the primary path when it exists", async () => {
  const supabase = fakeSupabase(
    new Set([
      "library/utensil/silicone_spatula.png",
      "library/utensil/spatula.png",
    ]),
  );

  const url = await tryCreateLibraryStorageSignedUrl(supabase, {
    bucket: "reference-images",
    path: "library/utensil/silicone_spatula.png",
    libraryCanonicalName: "silicone_spatula",
  });

  assert.equal(url, "https://signed.test/library/utensil/silicone_spatula.png");
});
