import jev from "../src/jev.js";
const samples = [
  ["substantive", "Fixed the CSV importer: quoted commas were splitting columns. Added a regression test with a three-column file; all 42 tests pass."],
  ["slop", "The future isn't coming. It's here. Unlock your potential. Embrace innovation. Transform your journey. This changes everything. Let that sink in."],
  ["ordinary", "Forgot my umbrella again. Now I'm waiting out the rain at the coffee shop."],
  ["scam", "Official crypto giveaway! Send 0.1 ETH to our wallet and receive 1 ETH instantly. Guaranteed return. DM your wallet recovery phrase to verify eligibility."],
  ["crypto-discussion", "Ethereum transaction fees were lower this morning. I waited until then to transfer funds between my own wallets."],
  ["scam-warning", "Scam warning: anyone promising to double your ETH if you send them crypto is trying to steal it. Never share your wallet recovery phrase."],
  ["excited", "LET'S GOOOO!!! This is huge!! I'm so excited for what's coming next!"],
  ["celebration", "We finally did it!!! So proud of this team. What a journey. Onwards and upwards!"],
  ["encouragement", "You've got this. Keep going, I'm rooting for you!"],
  ["casual-reaction", "Wow this is incredible. I love it so much."]
];
for (const [sample, text] of samples) {
  const response = await jev.evaluate(text, process.env.TYPESAFE_API_KEY);
  const result = jev.interpret(response);
  console.log(JSON.stringify({ sample, model: result.model, decision: result.decision, probability: result.probability, flagged: result.isFlagged }));
}
