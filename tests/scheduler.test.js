"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const scheduler = require("../src/scheduler.js");

const VIEW = 800;
const post = (name, top, height = 200) => ({ name, rect: { top, bottom: top + height } });

test("on-screen posts come first, in reading order", () => {
  const ordered = scheduler.order([post("lower", 500), post("upper", 50), post("ahead", 900)], VIEW, 1);
  assert.deepEqual(ordered.map((item) => item.name), ["upper", "lower", "ahead"]);
});

test("prefetch follows the scroll direction", () => {
  const posts = [post("above", -300), post("below", 900)];
  assert.deepEqual(scheduler.order(posts, VIEW, 1).map((item) => item.name), ["below", "above"]);
  assert.deepEqual(scheduler.order(posts, VIEW, -1).map((item) => item.name), ["above", "below"]);
});

test("posts far from the screen are not requested yet", () => {
  const ordered = scheduler.order([post("far below", 2000), post("far above", -1200), post("visible", 0)], VIEW, 1);
  assert.deepEqual(ordered.map((item) => item.name), ["visible"]);
});

test("a fling pauses requests, and speed decays once scrolling stops", () => {
  let clock = 0;
  const tracker = scheduler.createScrollTracker(() => clock);
  tracker.update(0, VIEW);
  clock = 100;
  tracker.update(VIEW * 2, VIEW);
  assert.equal(scheduler.isFling(tracker.speed()), true);
  assert.equal(tracker.direction(), 1);
  clock = 400;
  assert.equal(scheduler.isFling(tracker.speed()), false);
  clock = 500;
  tracker.update(VIEW * 1.9, VIEW);
  assert.equal(tracker.direction(), -1);
  assert.equal(scheduler.isFling(tracker.speed()), false);
});

test("retry backoff doubles and stays capped", () => {
  assert.equal(scheduler.retryDelay(1), 4000);
  assert.equal(scheduler.retryDelay(2), 8000);
  assert.equal(scheduler.retryDelay(10), 60000);
});
