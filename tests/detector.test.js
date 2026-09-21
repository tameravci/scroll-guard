"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSlop } = require("../src/detector.js");

test("flags a strong faux-insight template and names the evidence", () => {
  const result = detectSlop(
    "Here’s what nobody tells you about startups: distribution is the only moat."
  );
  assert.equal(result.isSlop, true);
  assert.equal(result.evidence[0].name, "Faux-insight setup");
  assert.match(result.evidence[0].excerpt, /nobody tells you/iu);
});

test("flags importance puffery", () => {
  const result = detectSlop(
    "This launch marks a pivotal moment for the company and its customers."
  );
  assert.equal(result.isSlop, true);
  assert.ok(result.families.includes("importance-puffery"));
});

test("flags a negative-listing template", () => {
  const result = detectSlop(
    "Not a dashboard. Not a spreadsheet. A command center for your entire business."
  );
  assert.equal(result.isSlop, true);
  assert.ok(result.families.includes("negative-listing"));
});

test("does not flag one ordinary buzzword in conservative mode", () => {
  const result = detectSlop(
    "We use a harness to keep the climber attached to the rope during practice."
  );
  assert.equal(result.isSlop, false);
  assert.ok(result.families.includes("buzzwords"));
});

test("requires two medium families in conservative mode", () => {
  const onlyContrast = detectSlop(
    "The question is not the model. It is the test suite that catches regressions."
  );
  assert.equal(onlyContrast.isSlop, false);

  const combined = detectSlop(
    "At its core, the question is not the model. It is the test suite that catches regressions."
  );
  assert.equal(combined.isSlop, true);
});

test("balanced mode accepts a medium pattern plus supporting evidence", () => {
  const result = detectSlop(
    "At its core, the robust harness catches deployment regressions.",
    { sensitivity: "balanced" }
  );
  assert.equal(result.isSlop, true);
});

test("balanced mode surfaces a single named structural pattern", () => {
  const binary = detectSlop(
    "The question isn't the model. It's the eval that catches regressions.",
    { sensitivity: "balanced" }
  );
  const colon = detectSlop("The best part: it learns from every interaction.", {
    sensitivity: "balanced"
  });
  const fakeVerb = detectSlop(
    "The app serves as a centralized hub for sponsor management.",
    { sensitivity: "balanced" }
  );
  assert.equal(binary.isSlop, true);
  assert.equal(colon.isSlop, true);
  assert.equal(fakeVerb.isSlop, true);
});

test("balanced mode flags a buzzword cluster but not one buzzword", () => {
  assert.equal(
    detectSlop("A safety harness keeps the climber attached to the rope.", {
      sensitivity: "balanced"
    }).isSlop,
    false
  );
  const cluster = detectSlop(
    "Our robust platform will leverage a transformative workflow for every team.",
    { sensitivity: "balanced" }
  );
  assert.equal(cluster.isSlop, true);
  assert.ok(cluster.families.includes("buzzword-cluster"));
});

test("detects self-answered questions, robotic rhythm, and decorative lists", () => {
  assert.equal(
    detectSlop("Want to know the secret? Distribution beats another feature every time.", {
      sensitivity: "balanced"
    }).isSlop,
    true
  );
  assert.equal(
    detectSlop("Build with focus. Ship with courage. Win with consistency.", {
      sensitivity: "balanced"
    }).isSlop,
    true
  );
  assert.equal(
    detectSlop("Three rules:\n✅ Move fast\n🚀 Think bigger\n🔥 Never settle", {
      sensitivity: "balanced"
    }).isSlop,
    true
  );
});

test("does not claim meta-discussion examples are slop", () => {
  const result = detectSlop(
    "Avoid the AI writing phrase “Here’s what nobody tells you” because it delays the point."
  );
  assert.equal(result.isSlop, false);
  assert.equal(result.reason, "meta-discussion");
});

test("skips very short text", () => {
  const result = detectSlop("Plot twist:");
  assert.equal(result.isSlop, false);
  assert.equal(result.reason, "too-short");
});

test("returns named patterns and short fixes without an authorship score", () => {
  const result = detectSlop(
    "Experts agree this robust platform serves as a centralized hub for modern teams."
  );
  assert.equal(result.isSlop, true);
  assert.ok(result.evidence.every((item) => item.name && item.fix && item.excerpt));
  assert.equal("score" in result, false);
  assert.equal("aiProbability" in result, false);
});

test("does not flag clear concrete writing", () => {
  const result = detectSlop(
    "The release cut the median build from 14 minutes to 6 minutes on our Linux runners."
  );
  assert.equal(result.isSlop, false);
  assert.deepEqual(result.evidence, []);
});
