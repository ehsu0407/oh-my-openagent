export type ContinuationMarkerSource = "todo" | "stop" | "boulder"

export type ContinuationMarkerState = "idle" | "active" | "stopped"

export interface ContinuationMarkerSourceEntry {
  state: ContinuationMarkerState
  reason?: string
  attemptCount?: number
  updatedAt: string
}

export interface ContinuationMarker {
  sessionID: string
  updatedAt: string
  sources: Partial<Record<ContinuationMarkerSource, ContinuationMarkerSourceEntry>>
}
