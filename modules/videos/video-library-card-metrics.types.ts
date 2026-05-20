export type VideoLibraryCardMetrics = {
  acceptedSegments: number;
  totalSegments: number;
  activeTaskCount: number;
  totalCostCredits: number;
  ownerName: string;
  nextAction: string;
  nextActionHref: string | null;
};

export type VideoLibraryCardMetricsByVideoId = Map<string, VideoLibraryCardMetrics>;
