(function attachPanel(root) {
  "use strict";

  // The four verdicts a user can flag. Colors match the frames drawn on X.
  const VERDICTS = [
    { key: "slop", label: "AI slop", hint: "Reads as AI-written" },
    { key: "clickbait", label: "Clickbait", hint: "Framing built for clicks" },
    { key: "bot", label: "Bot spam", hint: "Automated or mass-posted" },
    { key: "scam", label: "Scam", hint: "Fraud, phishing, fake giveaways" }
  ];
  const LEVELS = [
    { value: "conservative", label: "Fewer", threshold: 90 },
    { value: "balanced", label: "Balanced", threshold: 75 },
    { value: "sensitive", label: "More", threshold: 60 }
  ];

  function node(tag, className, text) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  async function mount(container, api, options = {}) {
    const settings = await api.getSettings();
    const verdicts = { ...settings.verdicts };
    const saved = () => options.onSaved?.();

    const flags = node("fieldset", "field");
    flags.append(node("legend", "", "Flag"));
    const chips = node("div", options.compact ? "chips compact" : "chips");
    const inputs = {};

    // Keep at least one verdict on, so the last active chip is locked.
    function lockLast() {
      const active = VERDICTS.filter(({ key }) => verdicts[key]);
      VERDICTS.forEach(({ key }) => {
        const locked = active.length === 1 && verdicts[key];
        inputs[key].disabled = locked;
        inputs[key].closest(".chip").title = locked ? "Keep at least one type on" : "";
      });
    }

    VERDICTS.forEach(({ key, label, hint }) => {
      const chip = node("label", "chip");
      chip.dataset.verdict = key;
      const input = node("input");
      input.type = "checkbox";
      input.checked = verdicts[key];
      input.name = "verdict";
      input.value = key;
      inputs[key] = input;
      const text = node("span", "chip-text");
      text.append(node("span", "chip-label", label));
      if (!options.compact) text.append(node("span", "chip-hint", hint));
      chip.append(input, node("span", "dot"), text);
      input.addEventListener("change", async () => {
        verdicts[key] = input.checked;
        lockLast();
        await api.updateSettings({ verdicts: { ...verdicts } });
        saved();
      });
      chips.append(chip);
    });
    flags.append(chips);

    const strictness = node("fieldset", "field");
    strictness.append(node("legend", "", "Strictness"));
    const segmented = node("div", "segmented");
    const hint = node("p", "hint");
    const describe = (value) => {
      const level = LEVELS.find((item) => item.value === value) || LEVELS[1];
      hint.textContent = `Flags a post when Jev is at least ${level.threshold}% sure.`;
    };
    LEVELS.forEach(({ value, label }) => {
      const option = node("label", "segment");
      const input = node("input");
      input.type = "radio";
      input.name = "sensitivity";
      input.value = value;
      input.checked = settings.sensitivity === value;
      input.addEventListener("change", async () => {
        describe(value);
        await api.updateSettings({ sensitivity: value });
        saved();
      });
      option.append(input, node("span", "", label));
      segmented.append(option);
    });
    describe(settings.sensitivity);
    strictness.append(segmented, hint);

    lockLast();
    container.replaceChildren(flags, strictness);
  }

  root.SlopSpotterPanel = { VERDICTS, LEVELS, mount };
})(globalThis);
