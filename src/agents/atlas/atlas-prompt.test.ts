import { describe, test, expect } from "bun:test"
import { ATLAS_SYSTEM_PROMPT } from "./default"
import { ATLAS_GPT_SYSTEM_PROMPT } from "./gpt"
import { ATLAS_GEMINI_SYSTEM_PROMPT } from "./gemini"

describe("Atlas prompts auto-continue policy", () => {
  test("default variant should forbid asking user for continuation confirmation", () => {
    // given
    const prompt = ATLAS_SYSTEM_PROMPT

    // when
    const lowerPrompt = prompt.toLowerCase()

    // then
    expect(lowerPrompt).toContain("auto-continue policy")
    expect(lowerPrompt).toContain("never ask the user")
    expect(lowerPrompt).toContain("should i continue")
    expect(lowerPrompt).toContain("proceed to next task")
    expect(lowerPrompt).toContain("approval-style")
    expect(lowerPrompt).toContain("auto-continue immediately")
  })

  test("gpt variant should forbid asking user for continuation confirmation", () => {
    // given
    const prompt = ATLAS_GPT_SYSTEM_PROMPT

    // when
    const lowerPrompt = prompt.toLowerCase()

    // then
    expect(lowerPrompt).toContain("auto-continue policy")
    expect(lowerPrompt).toContain("never ask the user")
    expect(lowerPrompt).toContain("should i continue")
    expect(lowerPrompt).toContain("proceed to next task")
    expect(lowerPrompt).toContain("approval-style")
    expect(lowerPrompt).toContain("auto-continue immediately")
  })

  test("gemini variant should forbid asking user for continuation confirmation", () => {
    // given
    const prompt = ATLAS_GEMINI_SYSTEM_PROMPT

    // when
    const lowerPrompt = prompt.toLowerCase()

    // then
    expect(lowerPrompt).toContain("auto-continue policy")
    expect(lowerPrompt).toContain("never ask the user")
    expect(lowerPrompt).toContain("should i continue")
    expect(lowerPrompt).toContain("proceed to next task")
    expect(lowerPrompt).toContain("approval-style")
    expect(lowerPrompt).toContain("auto-continue immediately")
  })

  test("all variants should require immediate continuation after verification passes", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toMatch(/auto-continue immediately after verification/)
      expect(lowerPrompt).toMatch(/immediately delegate next task/)
    }
  })

  test("all variants should define when user interaction is actually needed", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toMatch(/only pause.*truly blocked/)
      expect(lowerPrompt).toMatch(/plan needs clarification|blocked by external/)
    }
  })
})

describe("Atlas prompts anti-duplication coverage", () => {
  test("all variants should include anti-duplication rules for delegated exploration", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      expect(prompt).toContain("<Anti_Duplication>")
      expect(prompt).toContain("Anti-Duplication Rule")
      expect(prompt).toContain("DO NOT perform the same search yourself")
      expect(prompt).toContain("non-overlapping work")
    }
  })
})

describe("Atlas prompts plan path consistency", () => {
  test("default variant should use .sisyphus/plans/{plan-name}.md path", () => {
    // given
    const prompt = ATLAS_SYSTEM_PROMPT

    // when / then
    expect(prompt).toContain(".sisyphus/plans/{plan-name}.md")
    expect(prompt).not.toContain(".sisyphus/tasks/{plan-name}.yaml")
    expect(prompt).not.toContain(".sisyphus/tasks/")
  })

  test("gpt variant should use .sisyphus/plans/{plan-name}.md path", () => {
    // given
    const prompt = ATLAS_GPT_SYSTEM_PROMPT

    // when / then
    expect(prompt).toContain(".sisyphus/plans/{plan-name}.md")
    expect(prompt).not.toContain(".sisyphus/tasks/")
  })

  test("gemini variant should use .sisyphus/plans/{plan-name}.md path", () => {
    // given
    const prompt = ATLAS_GEMINI_SYSTEM_PROMPT

    // when / then
    expect(prompt).toContain(".sisyphus/plans/{plan-name}.md")
    expect(prompt).not.toContain(".sisyphus/tasks/")
  })

  test("all variants should read plan file after verification", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      expect(prompt).toMatch(/read[\s\S]*?\.sisyphus\/plans\//)
    }
  })

  test("all variants should distinguish top-level plan tasks from nested checkboxes", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toMatch(/top-level.*checkbox/)
      expect(lowerPrompt).toMatch(/ignore nested.*checkbox/)
      expect(lowerPrompt).toMatch(/final verification wave/)
    }
  })
})

describe("Atlas prompts decomposition policy", () => {
  test("all variants should keep decomposition in the main thread", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toContain("atlas owns decomposition")
      expect(lowerPrompt).toContain("coherent bounded slice")
      expect(lowerPrompt).toContain("do not over-split into microtasks")
    }
  })

  test("all variants should allow bounded sub-slices instead of raw checkbox-only delegation", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toContain("one coherent slice per delegation")
      expect(lowerPrompt).toContain("coherent sub-slice")
    }
  })

  test("all variants should keep parent checkboxes open until all sub-slices are done", () => {
    // given
    const prompts = [ATLAS_SYSTEM_PROMPT, ATLAS_GPT_SYSTEM_PROMPT, ATLAS_GEMINI_SYSTEM_PROMPT]

    // when / then
    for (const prompt of prompts) {
      const lowerPrompt = prompt.toLowerCase()
      expect(lowerPrompt).toContain("do not mark the parent checkbox complete")
      expect(lowerPrompt).toContain("record progress in todos/notepad")
      expect(lowerPrompt).toContain("parent checkbox is still open")
    }
  })
})
