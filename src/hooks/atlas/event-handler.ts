import type { PluginInput } from "@opencode-ai/plugin"
import { setContinuationMarkerSource } from "../../features/run-continuation-state"
import { OMO_INTERNAL_INITIATOR_MARKER } from "../../shared"
import { log } from "../../shared/logger"
import { HOOK_NAME } from "./hook-name"
import { isAbortError } from "./is-abort-error"
import { handleAtlasSessionIdle } from "./idle-event"
import type { AtlasHookOptions, SessionState } from "./types"

export function createAtlasEventHandler(input: {
  ctx: PluginInput
  options?: AtlasHookOptions
  sessions: Map<string, SessionState>
  getState: (sessionID: string) => SessionState
}): (arg: { event: { type: string; properties?: unknown } }) => Promise<void> {
  const { ctx, options, sessions, getState } = input

  const isInternalInitiatorMessage = async (sessionID: string, messageID: string | undefined): Promise<boolean> => {
    try {
      if (messageID) {
        const response = await ctx.client.session.message({
          path: { id: sessionID, messageID },
        })
        const data = response.data as { parts?: Array<{ type?: string; text?: string }> } | undefined
        if (data?.parts?.some((part) => part.type === "text" && typeof part.text === "string" && part.text.includes(OMO_INTERNAL_INITIATOR_MARKER))) {
          return true
        }
      }

      const messagesResponse = await ctx.client.session.messages({
        path: { id: sessionID },
        query: { limit: 5 },
      })
      const messages = (messagesResponse.data as Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }> | undefined) ?? []
      const latestUserMessage = [...messages].reverse().find((message) => message.info?.role === "user")
      return !!latestUserMessage?.parts?.some((part) => part.type === "text" && typeof part.text === "string" && part.text.includes(OMO_INTERNAL_INITIATOR_MARKER))
    } catch {
      return false
    }
  }

  return async ({ event }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const state = getState(sessionID)
      const isAbort = isAbortError(props?.error)
      state.lastEventWasAbortError = isAbort

      log(`[${HOOK_NAME}] session.error`, { sessionID, isAbort })
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return
      await handleAtlasSessionIdle({ ctx, options, getState, sessionID })
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      const role = info?.role as string | undefined
      const messageID = info?.id as string | undefined
      if (!sessionID) return

      const state = sessions.get(sessionID)
      const isRealUserMessage = role === "user" && !(await isInternalInitiatorMessage(sessionID, messageID))
      if (state) {
        state.lastEventWasAbortError = false
        if (isRealUserMessage) {
          state.waitingForFinalWaveApproval = false
          setContinuationMarkerSource(ctx.directory, sessionID, "approval", "idle")
        }
      } else if (isRealUserMessage) {
        setContinuationMarkerSource(ctx.directory, sessionID, "approval", "idle")
      }
      return
    }

    if (event.type === "message.part.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      const role = info?.role as string | undefined

      if (sessionID && role === "assistant") {
        const state = sessions.get(sessionID)
        if (state) {
          state.lastEventWasAbortError = false
        }
      }
      return
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        const state = sessions.get(sessionID)
        if (state) {
          state.lastEventWasAbortError = false
        }
      }
      return
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        const deletedState = sessions.get(sessionInfo.id)
        if (deletedState?.pendingRetryTimer) {
          clearTimeout(deletedState.pendingRetryTimer)
        }
        sessions.delete(sessionInfo.id)
        log(`[${HOOK_NAME}] Session deleted: cleaned up`, { sessionID: sessionInfo.id })
      }
      return
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (sessionID) {
        const compactedState = sessions.get(sessionID)
        if (compactedState?.pendingRetryTimer) {
          clearTimeout(compactedState.pendingRetryTimer)
        }
        sessions.delete(sessionID)
        log(`[${HOOK_NAME}] Session compacted: cleaned up`, { sessionID })
      }
    }
  }
}
