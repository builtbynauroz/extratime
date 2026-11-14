// What the permission prompt promises for "always" must match where the rule is saved. Run: npm test
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import assert from "node:assert/strict";
import { test } from "node:test";
import { rememberWhere } from "./session.js";

const rule = (destination: PermissionUpdate["destination"]): PermissionUpdate => ({
  type: "addRules",
  rules: [{ toolName: "Bash", ruleContent: "npm test" }],
  behavior: "allow",
  destination,
});

test("nothing to save means no 'always' choice", () => {
  assert.equal(rememberWhere(undefined), undefined);
  assert.equal(rememberWhere([]), undefined);
});

test("the prompt names the widest place the rule is saved", () => {
  assert.equal(rememberWhere([rule("session")]), "this session");
  assert.equal(rememberWhere([rule("localSettings")]), "in this project");
  assert.equal(rememberWhere([rule("session"), rule("projectSettings")]), "in this project's shared settings");
  assert.equal(rememberWhere([rule("localSettings"), rule("userSettings")]), "in any project");
});
