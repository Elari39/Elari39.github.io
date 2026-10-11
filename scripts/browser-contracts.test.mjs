import test from "node:test";
import assert from "node:assert/strict";
import { componentContrast } from "./browser-contracts.mjs";

// Minimal DOM fixtures for faults the previous parent-only check missed.
function contrastFixture(styles) {
  const previous = ["document", "getComputedStyle"].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const nodes = styles.map(style => ({ style, parentElement: null }));
  nodes.forEach((node, i) => { node.parentElement = nodes[i + 1] ?? null; });
  Object.assign(nodes[0], { textContent: "3", checkVisibility: () => true, closest: () => null });
  const context = {
    fillStyle: "", clearRect() {}, fillRect() {},
    getImageData() { return { data: this.fillStyle.match(/[\d.]+/g).map((v, i) => i === 3 ? Number(v) * 255 : Number(v)) }; },
  };
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    querySelectorAll: selector => selector.includes(".tagbar__n") ? [nodes[0]] : [],
  };
  globalThis.getComputedStyle = node => ({
    color: "rgba(0, 0, 0, 1)", backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none", opacity: "1", ...node.style,
  });
  try { return componentContrast(); }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("标签数字的透明度会降低对比度，不能只测父按钮", () => {
  const opaque = [{ color: "rgba(74, 74, 74, 1)" }, { backgroundColor: "rgba(255, 255, 255, 1)" }];
  assert.equal(contrastFixture(opaque).problems.length, 0);
  const faded = contrastFixture([{ ...opaque[0], opacity: "0.7" }, opaque[1]]);
  assert.equal(faded.count, 1);
  assert.match(faded.problems[0], /3\.93:1/);
});

test("祖先 opacity 合成整个组；文字和底色都须经过祖先透明度", () => {
  const result = contrastFixture([
    { color: "rgba(255, 255, 255, 1)" },
    { backgroundColor: "rgba(0, 0, 0, 1)", opacity: "0.5" },
    { backgroundColor: "rgba(255, 255, 255, 1)" },
  ]);
  assert.match(result.problems[0], /3\.98:1/);
});

test("文字颜色自身 alpha 也计入最终对比度", () => {
  const result = contrastFixture([
    { color: "rgba(0, 0, 0, 0.5)" },
    { backgroundColor: "rgba(255, 255, 255, 1)" },
  ]);
  assert.match(result.problems[0], /3\.98:1/);
});
