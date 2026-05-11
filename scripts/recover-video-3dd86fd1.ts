import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const VIDEO_ID = "3dd86fd1-8ddf-442a-b123-635b5eee5037";
const RUNWAY_OUTPUTS_BUCKET = "runway-outputs";
const MUX_VIDEO_API_BASE_URL = "https://api.mux.com/video/v1";
const MUX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MUX_BASIC_ESTIMATED_USD_PER_SECOND = 0.005;

type RecoveryTarget = {
  position: number;
  generationId: string;
  runwayTaskId: string;
  estimatedCredits: number;
  outputUrl?: string;
};

/**
 * Mapping rebuilt from cost_logs chronology and Runway task payloads.
 * Positions 6 and 7 correspond to the two tasks that succeeded on Runway but
 * were never persisted in Supabase/Mux.
 */
const RECOVERY_TARGETS: RecoveryTarget[] = [
  {
    position: 1,
    generationId: "9c54e274-bb9e-4b18-b373-40e5ff18cb6f",
    runwayTaskId: "0ac9427e-5e2d-4474-8351-254086d0c78e",
    estimatedCredits: 240,
  },
  {
    position: 2,
    generationId: "ddb27aaa-774c-42ea-b234-3f3f12c9b75b",
    runwayTaskId: "2de3bcf9-962a-49cc-9766-2d3f9db7be85",
    estimatedCredits: 240,
  },
  {
    position: 3,
    generationId: "52e46c31-a749-40ff-83e8-2cf184a43c17",
    runwayTaskId: "adb7bcef-6f86-4c01-83f6-35c4eef2b98c",
    estimatedCredits: 200,
  },
  {
    position: 4,
    generationId: "d7e94d3a-1e6e-4daf-a87c-9707309c101a",
    runwayTaskId: "d6dccd27-0ed6-4170-97d3-355d3978842b",
    estimatedCredits: 200,
  },
  {
    position: 5,
    generationId: "6057a6f7-efcd-4cdb-b6e3-8e3e23b63113",
    runwayTaskId: "ba4e5233-a02f-4d0c-9cd6-33cbad22f8da",
    estimatedCredits: 240,
  },
  {
    position: 6,
    generationId: "da2d6555-127f-44fe-a87a-39ea5dd1324e",
    runwayTaskId: "2e2d7ce6-7411-4601-9f05-d6be52be4d34",
    estimatedCredits: 200,
    outputUrl:
      "https://dnznrvs05pmza.cloudfront.net/seedance_2/cgt-20260511200001-k8kkv/Use__KitchenIslandDefault_for_global_Licorn_kitchen_identity__Use__KitchenIslandWide_for_breathable_.mp4?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiOTY2MDIwM2Q3ZjViYjFiNiIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc3ODYzMjUwOX0.u1wMRRG40-e8N18uxZJtnIVX7ElTNjmkvEphjKnWZko",
  },
  {
    position: 7,
    generationId: "e3cd09c7-88b1-44da-9950-4da41945eac2",
    runwayTaskId: "b33634d7-05de-437a-b00d-1031202b945d",
    estimatedCredits: 240,
    outputUrl:
      "https://dnznrvs05pmza.cloudfront.net/seedance_2/cgt-20260511195600-fv66s/Use__KitchenIslandDefault_for_global_Licorn_kitchen_identity__Use__CharacterSheet_with__PoseThreeQua.mp4?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNGM4ZDEzZmJmOGJjMWRkYiIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc3ODYwODUwN30.yxNNi4_VJemf4akikCNqt7VEsg22ji5sLaxJN_8bsQI",
  },
];

loadDotenvLocal();

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false } },
  );
  const segments = await query(
    supabase.from("segments").select("*").eq("video_id", VIDEO_ID).order("position"),
    "load segments failed",
  );
  const segmentByPosition = new Map(segments.map((segment) => [segment.position, segment]));

  const runwayAssets = await query(
    supabase
      .from("media_assets")
      .select("*")
      .eq("video_id", VIDEO_ID)
      .eq("type", "runway_output"),
    "load runway_output assets failed",
  );

  const assetByGenerationId = new Map<string, (typeof runwayAssets)[number]>();
  for (const asset of runwayAssets) {
    const generationId = asset.generation_id ?? generationIdFromStoragePath(asset.storage_path);
    if (generationId) {
      assetByGenerationId.set(generationId, asset);
    }
  }

  for (const target of RECOVERY_TARGETS) {
    const segment = segmentByPosition.get(target.position);
    if (!segment) {
      throw new Error(`Missing segment at position ${target.position}.`);
    }

    const generationRow = await queryMaybeSingle(
      supabase
        .from("generations")
        .select("id")
        .eq("id", target.generationId)
        .maybeSingle(),
      "generation lookup failed",
    );

    if (!generationRow) {
      await queryWrite(
        supabase.from("generations").insert({
          id: target.generationId,
          segment_id: segment.id,
          model: "seedance2",
          model_params: {
            source: "manual_recovery_after_segment_replace",
          },
          runway_task_id: target.runwayTaskId,
          status: "succeeded",
          cost_credits: target.estimatedCredits,
          duration_seconds: segment.duration_target,
          completed_at: new Date().toISOString(),
        }),
        "generation insert failed",
      );
    } else {
      await queryWrite(
        supabase
          .from("generations")
          .update({
            segment_id: segment.id,
            runway_task_id: target.runwayTaskId,
            status: "succeeded",
            cost_credits: target.estimatedCredits,
            duration_seconds: segment.duration_target,
          })
          .eq("id", target.generationId),
        "generation update failed",
      );
    }

    let asset = assetByGenerationId.get(target.generationId) ?? null;
    if (!asset && target.outputUrl) {
      const persistedAsset = await persistMissingRunwayOutput({
        supabase,
        outputUrl: target.outputUrl,
        segmentId: segment.id,
        generationId: target.generationId,
      });
      asset = persistedAsset;
      assetByGenerationId.set(target.generationId, persistedAsset);
    }

    if (!asset) {
      throw new Error(
        `No media asset found for generation ${target.generationId} and no output URL was provided.`,
      );
    }

    if (asset.segment_id !== segment.id || asset.generation_id !== target.generationId) {
      await queryWrite(
        supabase
          .from("media_assets")
          .update({
            segment_id: segment.id,
            generation_id: target.generationId,
          })
          .eq("id", asset.id),
        "media asset relink failed",
      );
    }

    if (!asset.mux_playback_id) {
      await uploadAssetToMux({ supabase, asset });
      const refreshedAsset = await querySingle(
        supabase.from("media_assets").select("*").eq("id", asset.id).single(),
        "refresh media asset after mux upload failed",
      );
      asset = refreshedAsset;
      assetByGenerationId.set(target.generationId, refreshedAsset);
    }

    await queryWrite(
      supabase
        .from("generations")
        .update({
          media_asset_id: asset.id,
        })
        .eq("id", target.generationId),
      "generation.media_asset_id update failed",
    );

    await queryWrite(
      supabase
        .from("segments")
        .update({
          selected_generation_id: target.generationId,
          status: "review",
        })
        .eq("id", segment.id),
      "segment recovery update failed",
    );

    await queryWrite(
      supabase
        .from("cost_logs")
        .update({
          segment_id: segment.id,
        })
        .eq("video_id", VIDEO_ID)
        .contains("metadata", { generationId: target.generationId }),
      "runway/openai cost log relink failed",
    );

    await queryWrite(
      supabase
        .from("cost_logs")
        .update({
          segment_id: segment.id,
        })
        .eq("video_id", VIDEO_ID)
        .contains("metadata", { mediaAssetId: asset.id }),
      "mux cost log relink failed",
    );
  }

  await queryWrite(
    supabase.from("videos").update({ status: "review" }).eq("id", VIDEO_ID),
    "video status update failed",
  );

  const sunoAssets = await query(
    supabase
      .from("media_assets")
      .select("id,video_id,status,storage_bucket,storage_path")
      .eq("video_id", VIDEO_ID)
      .eq("type", "suno_audio"),
    "suno assets check failed",
  );

  const compositions = await query(
    supabase
      .from("compositions")
      .select("id,audio_media_asset_id,updated_at")
      .eq("video_id", VIDEO_ID)
      .order("updated_at", { ascending: false }),
    "compositions check failed",
  );

  console.log(
    JSON.stringify(
      {
        videoId: VIDEO_ID,
        recoveredGenerations: RECOVERY_TARGETS.map((target) => target.generationId),
        sunoAssets,
        compositions,
      },
      null,
      2,
    ),
  );
}

async function persistMissingRunwayOutput(input: {
  supabase: ReturnType<typeof createClient>;
  outputUrl: string;
  segmentId: string;
  generationId: string;
}) {
  const response = await fetch(input.outputUrl);
  if (!response.ok) {
    throw new Error(
      `Runway output download failed (${response.status} ${response.statusText})`,
    );
  }

  const body = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "video/mp4";
  const storagePath = `${VIDEO_ID}/${input.segmentId}/${input.generationId}.mp4`;

  const uploadResult = await input.supabase.storage
    .from(RUNWAY_OUTPUTS_BUCKET)
    .upload(storagePath, body, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadResult.error) {
    throw new Error(`Supabase upload failed: ${uploadResult.error.message}`);
  }

  return querySingle(
    input.supabase
      .from("media_assets")
      .insert({
        video_id: VIDEO_ID,
        segment_id: input.segmentId,
        generation_id: input.generationId,
        type: "runway_output",
        provider: "runway",
        storage_bucket: RUNWAY_OUTPUTS_BUCKET,
        storage_path: storagePath,
        runway_output_url: input.outputUrl,
        original_filename: `${input.generationId}.mp4`,
        mime_type: mimeType,
        file_size_bytes: body.length,
        status: "stored",
        metadata: {
          source: "runway_missing_output_recovery",
          recovery: true,
        },
      })
      .select("*")
      .single(),
    "insert missing runway output asset failed",
  );
}

async function uploadAssetToMux(input: {
  supabase: ReturnType<typeof createClient>;
  asset: {
    id: string;
    storage_bucket: string | null;
    storage_path: string | null;
    duration_seconds: number | null;
    segment_id: string | null;
  };
}) {
  if (!input.asset.storage_bucket || !input.asset.storage_path) {
    throw new Error(`Asset ${input.asset.id} has no storage location.`);
  }

  const signedUrlResult = await input.supabase.storage
    .from(input.asset.storage_bucket)
    .createSignedUrl(input.asset.storage_path, MUX_SIGNED_URL_TTL_SECONDS);
  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new Error(
      `Unable to create signed URL for Mux upload: ${signedUrlResult.error?.message ?? "unknown error"}`,
    );
  }

  const muxResponse = await fetch(`${MUX_VIDEO_API_BASE_URL}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getMuxBasicAuthToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ url: signedUrlResult.data.signedUrl }],
      playback_policies: ["public"],
      passthrough: input.asset.id,
      video_quality: "basic",
    }),
  });
  const muxPayload = (await muxResponse.json().catch(() => null)) as
    | {
        data?: {
          id?: string;
          status?: string;
          playback_ids?: Array<{ id?: string }>;
        };
      }
    | null;
  if (!muxResponse.ok) {
    throw new Error(
      `Mux upload failed (${muxResponse.status}): ${JSON.stringify(muxPayload)}`,
    );
  }

  const muxAssetId = muxPayload?.data?.id;
  const muxPlaybackId = muxPayload?.data?.playback_ids?.[0]?.id;
  if (!muxAssetId || !muxPlaybackId) {
    throw new Error("Mux upload succeeded but payload is missing IDs.");
  }

  await queryWrite(
    input.supabase
      .from("media_assets")
      .update({
        mux_asset_id: muxAssetId,
        mux_playback_id: muxPlaybackId,
        status: "uploaded_to_mux",
      })
      .eq("id", input.asset.id),
    "media_assets mux metadata update failed",
  );

  const estimatedMuxDollars =
    typeof input.asset.duration_seconds === "number" && input.asset.duration_seconds > 0
      ? Number(
          (input.asset.duration_seconds * MUX_BASIC_ESTIMATED_USD_PER_SECOND).toFixed(4),
        )
      : null;

  await queryWrite(
    input.supabase.from("cost_logs").insert({
      video_id: VIDEO_ID,
      segment_id: input.asset.segment_id,
      provider: "mux",
      model: "basic-on-demand",
      operation: "media_asset_uploaded_to_mux",
      cost_dollars: estimatedMuxDollars,
      metadata: {
        estimated: true,
        mediaAssetId: input.asset.id,
        muxAssetId,
        muxPlaybackId,
        estimatedDollarsPerSecond: MUX_BASIC_ESTIMATED_USD_PER_SECOND,
      },
    }),
    "insert mux cost log failed",
  );
}

function generationIdFromStoragePath(storagePath: string | null) {
  if (!storagePath) {
    return null;
  }
  const filename = storagePath.split("/").at(-1);
  if (!filename || !filename.endsWith(".mp4")) {
    return null;
  }
  return filename.slice(0, -4);
}

function loadDotenvLocal() {
  const envContent = readFileSync(".env.local", "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var ${key}.`);
  }
  return value;
}

function getMuxBasicAuthToken() {
  const tokenId = requireEnv("MUX_TOKEN_ID");
  const tokenSecret = requireEnv("MUX_TOKEN_SECRET");
  return Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");
}

async function query<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  errorLabel: string,
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${errorLabel}: ${error.message}`);
  }
  return (data ?? []) as Exclude<T, null>;
}

async function querySingle<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  errorLabel: string,
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${errorLabel}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`${errorLabel}: expected a row but got null.`);
  }
  return data;
}

async function queryMaybeSingle<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  errorLabel: string,
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${errorLabel}: ${error.message}`);
  }
  return data;
}

async function queryWrite(
  promise: PromiseLike<{ error: { message: string } | null }>,
  errorLabel: string,
) {
  const { error } = await promise;
  if (error) {
    throw new Error(`${errorLabel}: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
