export const RUNWAY_BUDGET_WARNING_THRESHOLDS = [20, 10] as const;

/**
 * Estimated US dollar cost per second of Mux Pay-as-you-go Basic on-demand
 * playback delivery. Source: Mux pricing for Basic on-demand video at the
 * time of writing (subject to monthly review). We expose this as an
 * estimation only — `cost_logs.cost_dollars` is documented as estimable when
 * exact provider data is not available.
 *
 * Encoding cost (~$0.0006 / minute) and storage cost (~$0.003 / minute / day)
 * are folded into a flat per-second number so the dashboard can show a single
 * dollar figure per upload. Tune this with real billing data post-hackathon.
 */
export const MUX_BASIC_ESTIMATED_USD_PER_SECOND = 0.005;
