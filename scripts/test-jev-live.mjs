import jev from "../src/jev.js";
const samples = [
  ["substantive", "Fixed the CSV importer: quoted commas were splitting columns. Added a regression test with a three-column file; all 42 tests pass."],
  ["slop", "The future isn't coming. It's here. Unlock your potential. Embrace innovation. Transform your journey. This changes everything. Let that sink in."],
  ["ordinary", "Forgot my umbrella again. Now I'm waiting out the rain at the coffee shop."]
];
for (const [sample, text] of samples) {
  const response = await jev.evaluate(text, process.env.TYPESAFE_API_KEY);
  const result = jev.interpret(response);
  console.log(JSON.stringify({ sample, model: result.model, decision: result.decision, probability: result.probability, flagged: result.isSlop }));
}
