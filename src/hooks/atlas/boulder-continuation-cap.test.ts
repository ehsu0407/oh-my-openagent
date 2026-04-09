import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearBoulderState, writeBoulderState } from "../../features/boulder-state"
import { _resetForTesting, registerAgentName } from "../../features/claude-code-session-state"
import { readContinuationMarker } from "../../features/run-continuation-state"
import { createAtlasHook } from "./atlas-hook"

describe("atlas boulder continuation cap", () => {
  const sessionID = "atlas-cap-session"
  let testDir = ""
  let fakeNow = 0
  const originalDateNow = Date.now

  beforeEach(() => {
    _resetForTesting()
    registerAgentName("atlas")
    testDir = mkdtempSync(join(tmpdir(), "atlas-cap-"))
    mkdirSync(join(testDir, ".sisyphus", "plans"), { recursive: true })
    const planPath = join(testDir, ".sisyphus", "plans", "cap-plan.md")
    writeFileSync(planPath, "- [ ] blocked task\n", "utf-8")
    writeBoulderState(testDir, {
      active_plan: planPath,
      started_at: "2026-01-02T10:00:00Z",
      session_ids: [sessionID],
      plan_name: "cap-plan",
      agent: "atlas",
    })
    fakeNow = 1_000
    Date.now = () => fakeNow
  })

  afterEach(() => {
    Date.now = originalDateNow
    _resetForTesting()
    clearBoulderState(testDir)
    rmSync(testDir, { recursive: true, force: true })
  })

  function createHook(promptAsyncMock: ReturnType<typeof mock>) {
    return createAtlasHook({
      directory: testDir,
      client: {
        session: {
          promptAsync: promptAsyncMock,
          messages: async () => ({ data: [] }),
          get: async ({ path }: { path: { id: string } }) => ({
            data: {
              id: path.id,
              parentID: undefined,
            },
          }),
        },
      },
    } as unknown as PluginInput)
  }

  test("caps atlas at three consecutive boulder auto-continuations", async () => {
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(3)
    const marker = readContinuationMarker(testDir, sessionID)
    expect(marker?.sources.boulder?.state).toBe("stopped")
    expect(marker?.sources.boulder?.reason).toContain("3 consecutive attempts")
  })

  test("resets the boulder continuation cap after a new user message", async () => {
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    await hook.handler({
      event: {
        type: "message.updated",
        properties: { info: { sessionID, role: "user" } },
      },
    })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(4)
    const marker = readContinuationMarker(testDir, sessionID)
    expect(marker?.sources.boulder?.state).toBe("idle")
  })

  test("does not reset the cap for internal continuation user messages that carry an agent", async () => {
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    await hook.handler({
      event: {
        type: "message.updated",
        properties: { info: { sessionID, role: "user", agent: "Sisyphus (Ultraworker)" } },
      },
    })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(3)
    const marker = readContinuationMarker(testDir, sessionID)
    expect(marker?.sources.boulder?.state).toBe("stopped")
  })

  test("shares the cap across multiple tracked sessions for the same boulder", async () => {
    const siblingSessionID = "atlas-cap-session-2"
    const planPath = join(testDir, ".sisyphus", "plans", "cap-plan.md")
    writeBoulderState(testDir, {
      active_plan: planPath,
      started_at: "2026-01-02T10:00:00Z",
      session_ids: [sessionID, siblingSessionID],
      session_origins: {
        [sessionID]: "direct",
        [siblingSessionID]: "direct",
      },
      plan_name: "cap-plan",
      agent: "atlas",
    })
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID: siblingSessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID: siblingSessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(3)
    const marker = readContinuationMarker(testDir, siblingSessionID)
    expect(marker?.sources.boulder?.state).toBe("stopped")
  })

  test("resets the cap when the same plan restarts with a new started_at", async () => {
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)
    const planPath = join(testDir, ".sisyphus", "plans", "cap-plan.md")

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    writeBoulderState(testDir, {
      active_plan: planPath,
      started_at: "2026-01-02T11:00:00Z",
      session_ids: [sessionID],
      plan_name: "cap-plan",
      agent: "atlas",
    })

    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(4)
    const marker = readContinuationMarker(testDir, sessionID)
    expect(marker?.sources.boulder?.state).toBe("idle")
  })

  test("does not clear the shared boulder cap when a sibling session is deleted", async () => {
    const siblingSessionID = "atlas-cap-session-2"
    const planPath = join(testDir, ".sisyphus", "plans", "cap-plan.md")
    writeBoulderState(testDir, {
      active_plan: planPath,
      started_at: "2026-01-02T10:00:00Z",
      session_ids: [sessionID, siblingSessionID],
      session_origins: {
        [sessionID]: "direct",
        [siblingSessionID]: "direct",
      },
      plan_name: "cap-plan",
      agent: "atlas",
    })
    const promptAsyncMock = mock(async () => ({}))
    const hook = createHook(promptAsyncMock)

    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID: siblingSessionID } } })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    await hook.handler({
      event: {
        type: "session.deleted",
        properties: { info: { id: siblingSessionID } },
      },
    })
    fakeNow += 6_000
    await hook.handler({ event: { type: "session.idle", properties: { sessionID } } })

    expect(promptAsyncMock).toHaveBeenCalledTimes(3)
    const marker = readContinuationMarker(testDir, sessionID)
    expect(marker?.sources.boulder?.state).toBe("stopped")
  })
})
