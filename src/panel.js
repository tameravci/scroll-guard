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
  const THRESHOLD_MIN = 20;
  const THRESHOLD_MAX = 99;

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
    // Strictness is one number: the lowest Jev probability, in percent, that flags.
    const field = node("label", "threshold");
    const number = node("input", "text-input");
    number.type = "number";
    number.min = String(THRESHOLD_MIN);
    number.max = String(THRESHOLD_MAX);
    number.step = "1";
    number.inputMode = "numeric";
    number.setAttribute("aria-label", "Strictness threshold in percent");
    number.value = String(settings.sensitivity);
    field.append(number, node("span", "", "%"));
    const describe = (value) => {
      hint.textContent = `Flags posts Jev rates ${value}% or higher`;
    };
    number.addEventListener("change", async () => {
      const typed = Math.round(Number(number.value));
      const value = Number.isFinite(typed) && number.value !== ""
        ? Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, typed))
        : settings.sensitivity;
      number.value = String(value);
      describe(value);
      settings.sensitivity = value;
      await api.updateSettings({ sensitivity: value });
      saved();
    });
    describe(settings.sensitivity);
    strictness.append(copy, field);

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

  root.ScrollGuardPanel = { VERDICTS, mount, attachKeyTail };
})(globalThis);
