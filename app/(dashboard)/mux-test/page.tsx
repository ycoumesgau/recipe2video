import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  listMuxPlayableMediaAssets,
  listMuxUploadCandidates,
} from "@/modules/media-assets/repositories/media-asset.repository";
import { MuxUploadTestPanel } from "@/modules/media-assets/ui/mux-upload-test-panel";

export default async function MuxTestPage() {
  const { candidates, playableAssets, dataError } = await loadMuxTestData();

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Issue #5
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight">
          Mux playback test
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Upload a Supabase-stored MP4 to Mux Pay-as-you-go Basic and verify
          playback with the stored playback ID.
        </p>
      </div>

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Mux test data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      <MuxUploadTestPanel
        candidates={candidates}
        playableAssets={playableAssets}
      />
    </div>
  );
}

async function loadMuxTestData() {
  try {
    const supabase = createSupabaseAdminClient();
    const [candidates, playableAssets] = await Promise.all([
      listMuxUploadCandidates(supabase, 10),
      listMuxPlayableMediaAssets(supabase, 10),
    ]);

    return { candidates, playableAssets, dataError: null };
  } catch (error) {
    return {
      candidates: [],
      playableAssets: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load Mux media assets.",
    };
  }
}
