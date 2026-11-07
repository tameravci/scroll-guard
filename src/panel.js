(function attachPanel(root) {
  "use strict";

  // The four verdict types a user can flag. Tick colors match the frames drawn on X.
  const VERDICTS = [
    { key: "slop", label: "AI slop", hint: "Reads as AI-written" },
    { key: "clickbait", label: "Clickbait", hint: "Framing built for clicks" },
    { key: "bot", label: "Bot spam", hint: "Automated, copy-paste, or reply farming" },
    { key: "shill", label: "Shilling", hint: "Undisclosed paid promotion" },
    { key: "scam", label: "Scam", hint: "Fraud, phishing, fake giveaways" }
  ];
  const LEVELS = [
    { value: "conservative", label: "Fewer", threshold: 90 },
    { value: "balanced", label: "Balanced", threshold: 75 },
    { value: "sensitive", label: "More", threshold: 60 },
    { value: "custom", label: "Custom" }
  ];
  const CUSTOM_MIN = 20;
  const CUSTOM_MAX = 99;

  function node(tag, className, text) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  // Renders the verdict list and the strictness control. options.counts adds a
  // per-type count column; options.hints adds a one-line description per type.
  async function mount(container, api, options = {}) {
    const settings = await api.getSettings();
    const verdicts = { ...settings.verdicts };
    const saved = () => options.onChange?.(null, {});
    const inputs = {};

    const section = node("section", "group");
    section.setAttribute("aria-label", "Flag");
    const list = node("div", "list");

    VERDICTS.forEach(({ key, label, hint }) => {
      const row = node("label", "row");
      row.dataset.verdict = key;
      const text = node("span", "row-text");
      text.append(node("span", "row-label", label));
      if (options.hints) text.append(node("span", "row-hint", hint));
      const input = node("input", "check");
      input.type = "checkbox";
      input.checked = verdicts[key];
      input.name = "verdict";
      input.value = key;
      inputs[key] = input;
      row.append(node("span", "tick"), text);
      if (options.counts) row.append(node("span", "row-count", String(options.counts[key] || 0)));
      row.append(input);
      input.addEventListener("change", async () => {
        const wasEmpty = VERDICTS.every((verdict) => !verdicts[verdict.key]);
        verdicts[key] = input.checked;
        const empty = VERDICTS.every((verdict) => !verdicts[verdict.key]);
        const patch = { verdicts: { ...verdicts } };
        // Unchecking the last type pauses the extension; checking one again resumes it.
        if (empty) patch.enabled = false;
        else if (wasEmpty) patch.enabled = true;
        const next = await api.updateSettings(patch);
        options.onChange?.(next, { paused: empty, resumed: wasEmpty && !empty });
      });
      list.append(row);
    });
    // The column label only earns its place when there is a count column to label.
    if (options.counts) {
      const head = node("div", "group-head");
      head.append(node("span", "", "Flag"), node("span", "", "24 h"));
      section.append(head);
    }
    section.append(list);

    const strictness = node("div", "setting");
    const copy = node("div", "row-text");
    const hint = node("span", "row-hint");
    copy.append(node("span", "row-label", "Strictness"), hint);
    const segmented = node("div", "segmented");
    segmented.setAttribute("role", "radiogroup");
    segmented.setAttribute("aria-label", "Strictness");
    // The setting is a preset name or an exact threshold in percent.
    const thresholdOf = (value) =>
      Number.isInteger(value) ? value : (LEVELS.find((item) => item.value === value) || LEVELS[1]).threshold;
    const describe = (value) => {
      hint.textContent = `Flags posts Jev rates ${thresholdOf(value)}% or higher`;
    };
    const custom = node("label", "custom-threshold");
    const number = node("input", "text-input");
    number.type = "number";
    number.min = String(CUSTOM_MIN);
    number.max = String(CUSTOM_MAX);
    number.step = "1";
    number.inputMode = "numeric";
    number.value = String(thresholdOf(settings.sensitivity));
    custom.append(node("span", "", "Threshold"), number, node("span", "", "%"));
    custom.hidden = !Number.isInteger(settings.sensitivity);
    const saveCustom = async () => {
      const value = Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(Number(number.value) || thresholdOf("balanced"))));
      number.value = String(value);
      describe(value);
      await api.updateSettings({ sensitivity: value });
      saved();
    };
    number.addEventListener("change", saveCustom);
    LEVELS.forEach(({ value, label }) => {
      const option = node("label", "segment");
      const input = node("input");
      input.type = "radio";
      input.name = "sensitivity";
      input.value = value;
      input.checked = value === "custom" ? Number.isInteger(settings.sensitivity) : settings.sensitivity === value;
      input.addEventListener("change", async () => {
        custom.hidden = value !== "custom";
        if (value === "custom") {
          await saveCustom();
          number.focus();
          return;
        }
        number.value = String(thresholdOf(value));
        describe(value);
        await api.updateSettings({ sensitivity: value });
        saved();
      });
      option.append(input, node("span", "", label));
      segmented.append(option);
    });
    describe(settings.sensitivity);
    strictness.append(copy, segmented, custom);

    container.replaceChildren(section, strictness);
    return {
      // Reflects a change made elsewhere, such as the popup switch reviving every type.
      setVerdicts(next) {
        VERDICTS.forEach(({ key }) => {
          verdicts[key] = next[key] !== false;
          inputs[key].checked = verdicts[key];
        });
      }
    };
  }

  // Shows the last 4 characters of a masked key inside the field's right edge,
  // so a pasted key can be recognized without revealing it.
  function attachKeyTail(input) {
    const field = node("span", "key-field");
    const tail = node("span", "key-tail");
    tail.setAttribute("aria-hidden", "true");
    input.replaceWith(field);
    field.append(input, tail);
    const update = () => {
      const value = input.value.trim();
      tail.textContent = value.length >= 8 ? `…${value.slice(-4)}` : "";
      field.classList.toggle("has-tail", Boolean(tail.textContent));
    };
    input.addEventListener("input", update);
    input.form?.addEventListener("reset", () => setTimeout(update));
    update();
    return update;
  }

  root.ScrollGuardPanel = { VERDICTS, LEVELS, mount, attachKeyTail };
})(globalThis);
