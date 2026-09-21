(function attachDetector(root, factory) {
  const api = factory();
  root.SlopSpotter = Object.assign(root.SlopSpotter || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDetector() {
  "use strict";

  const STRENGTH = Object.freeze({
    STRONG: "strong",
    MEDIUM: "medium",
    SUPPORT: "support"
  });

  const RULES = Object.freeze([
    {
      id: "throat-clearing",
      name: "Throat-clearing opener",
      family: "throat-clearing",
      strength: STRENGTH.STRONG,
      fix: "Start with the actual claim.",
      pattern:
        /\b(?:here(?:'|’)?s the thing|here(?:'|’)?s what i mean|let me be clear|i(?:'|’)?ll be honest|the uncomfortable truth is)\b/giu
    },
    {
      id: "faux-insight",
      name: "Faux-insight setup",
      family: "faux-insight",
      strength: STRENGTH.STRONG,
      fix: "Make the claim without the lone-expert setup.",
      pattern:
        /\b(?:this is the part (?:most people|everyone) (?:skip|miss(?:es)?)|what most people get wrong|what nobody tells you|here(?:'|’)?s what nobody tells you|the part everyone misses)\b/giu
    },
    {
      id: "hype-claim",
      name: "Hype claim",
      family: "importance-puffery",
      strength: STRENGTH.STRONG,
      fix: "State the concrete change and let readers judge it.",
      pattern:
        /\b(?:this is huge|this changes everything|marks? a pivotal moment|stands? as a testament|plays? a vital role|solidif(?:y|ies) (?:its|their) position|underscores? (?:its|the) significance)\b/giu
    },
    {
      id: "weasel-attribution",
      name: "Weasel attribution",
      family: "weasel-attribution",
      strength: STRENGTH.STRONG,
      fix: "Name the source or remove the attribution.",
      pattern:
        /\b(?:experts agree|industry reports suggest|many argue|widely regarded as|studies show|research shows)\b/giu
    },
    {
      id: "rhetorical-setup",
      name: "Rhetorical setup",
      family: "rhetorical-setup",
      strength: STRENGTH.STRONG,
      fix: "Drop the setup and state the point.",
      pattern: /\b(?:what if i told you|think about it|plot twist)\s*[:?,]/giu
    },
    {
      id: "negative-listing",
      name: "Negative listing",
      family: "negative-listing",
      strength: STRENGTH.STRONG,
      fix: "Say what the thing is directly.",
      pattern:
        /(?:^|[.!?]\s+)not\s+[^.!?\n]{1,55}[.!]\s+not\s+[^.!?\n]{1,55}[.!]\s+(?:an?|the)\s+[^.!?\n]{1,70}/giu
    },
    {
      id: "dramatic-kicker",
      name: "Dramatic fragmentation",
      family: "dramatic-fragmentation",
      strength: STRENGTH.STRONG,
      fix: "End on the concrete point.",
      pattern:
        /\b(?:that(?:'|’)?s it[.!]\s+that(?:'|’)?s the whole thing|let that sink in|read that again)\b/giu
    },
    {
      id: "binary-contrast",
      name: "Binary contrast",
      family: "binary-contrast",
      strength: STRENGTH.MEDIUM,
      fix: "State the stronger point directly.",
      pattern:
        /\b(?:it|this|that|the (?:question|point|issue|problem|answer))\s+(?:isn(?:'|’)t|is not|wasn(?:'|’)t|was not)\s+[^.!?\n]{1,85}[.!?,;:]\s*(?:it(?:'|’)?s|it is|this is|that is)\s+[^.!?\n]{1,100}/giu
    },
    {
      id: "not-just-contrast",
      name: "Binary contrast",
      family: "binary-contrast",
      strength: STRENGTH.MEDIUM,
      fix: "State the stronger point directly.",
      pattern:
        /\b(?:it(?:'|’)?s|this is|that is)\s+not just\s+[^.!?\n]{1,75}\s+but(?: also)?\s+[^.!?\n]{1,100}/giu
    },
    {
      id: "colon-reveal",
      name: "Colon reveal",
      family: "colon-reveal",
      strength: STRENGTH.MEDIUM,
      fix: "Rewrite the reveal as a plain sentence.",
      pattern:
        /\b(?:[Tt]he (?:best|hard|wild|strange|important) part|[Tt]he (?:key|secret|truth|lesson|takeaway|result|shift|catch|insight|reason|opportunity|reality)|[Ww]hat makes (?:it|this) work|[Tt]he detail that makes it work)\s*:\s*[a-z][^.!?\n]{2,120}/gu
    },
    {
      id: "superficial-analysis",
      name: "Superficial analysis",
      family: "superficial-analysis",
      strength: STRENGTH.MEDIUM,
      fix: "Explain the actual consequence or mechanism.",
      pattern:
        /,\s+(?:highlighting|underscoring|reflecting|showcasing)\b[^.!?\n]{0,120}/giu
    },
    {
      id: "fake-strong-verb",
      name: "Fake-strong verb",
      family: "fake-strong-verb",
      strength: STRENGTH.MEDIUM,
      fix: "Use “is,” “has,” or a concrete action.",
      pattern:
        /\b(?:serves as|stands as|functions as)\s+(?:(?:an?|the)\s+)?(?:centralized\s+)?(?:hub|platform|testament|solution|cornerstone|catalyst)\b/giu
    },
    {
      id: "empty-phrase",
      name: "Empty lead-in",
      family: "empty-phrase",
      strength: STRENGTH.MEDIUM,
      fix: "Remove the lead-in and get to the point.",
      pattern:
        /\b(?:it(?:'|’)?s worth noting|it(?:'|’)?s important to note|at the end of the day|when it comes to|at its core|in today(?:'|’)?s world|in the age of|in the world of|the reality is|the truth is|going forward|let(?:'|’)?s dive in)\b/giu
    },
    {
      id: "stacked-conjunctions",
      name: "Dramatic fragmentation",
      family: "dramatic-fragmentation",
      strength: STRENGTH.MEDIUM,
      fix: "Use a complete sentence instead of stacked fragments.",
      pattern:
        /(?:^|[.!?]\s+)(?:and|but)\s+[^.!?\n]{1,38}[.!]\s+(?:and|but)\s+[^.!?\n]{1,38}[.!]/giu
    },
    {
      id: "buzzword",
      name: "AI-flavored buzzword",
      family: "buzzwords",
      strength: STRENGTH.SUPPORT,
      fix: "Replace it with a specific fact or direct verb.",
      pattern:
        /\b(?:delve|foster|leverage|utilize|facilitate|empower|streamline|robust|cutting-edge|paradigm shift|game changer|tapestry|realm|beacon|multifaceted|meticulous|intricate|paramount|transformative|elevate|embark|supercharge|harness|ever-evolving)\b/giu
    },
    {
      id: "summary-recap",
      name: "Summary-recap ending",
      family: "summary-recap",
      strength: STRENGTH.SUPPORT,
      fix: "End on the last concrete point or next action.",
      pattern: /(?:^|\n)\s*(?:in conclusion|ultimately|overall)\s*[,.:]/giu,
      onlyNearEnd: true
    }
  ]);

  function excerptFor(text, index, length) {
    const radius = 54;
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + length + radius);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    return (
      prefix +
      text
        .slice(start, end)
        .replace(/\s+/gu, " ")
        .trim() +
      suffix
    );
  }

  function collectRuleEvidence(rule, text) {
    const evidence = [];
    rule.pattern.lastIndex = 0;
    let match;

    while ((match = rule.pattern.exec(text)) !== null) {
      if (rule.onlyNearEnd && match.index < text.length * 0.55) {
        continue;
      }

      const matchedText = match[0].replace(/\s+/gu, " ").trim();
      evidence.push({
        ruleId: rule.id,
        name: rule.name,
        family: rule.family,
        strength: rule.strength,
        fix: rule.fix,
        matchedText,
        excerpt: excerptFor(text, match.index, match[0].length),
        index: match.index,
        length: match[0].length
      });

      if (evidence.length >= 2) {
        break;
      }
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1;
      }
    }

    rule.pattern.lastIndex = 0;
    return evidence;
  }

  function collectEmDashEvidence(text) {
    const positions = [];
    for (let index = text.indexOf("—"); index >= 0; index = text.indexOf("—", index + 1)) {
      positions.push(index);
    }

    if (positions.length < 2 || text.length > 600) {
      return [];
    }

    return [
      {
        ruleId: "em-dash-cluster",
        name: "Em-dash cluster",
        family: "em-dash-cluster",
        strength: STRENGTH.SUPPORT,
        fix: "Use commas or periods unless the dashes add clarity.",
        matchedText: `${positions.length} em dashes`,
        excerpt: excerptFor(text, positions[0], 1),
        index: positions[0],
        length: 1
      }
    ];
  }

  function customEvidence(rule, text, index, matchedText) {
    return {
      ruleId: rule.id,
      name: rule.name,
      family: rule.family,
      strength: rule.strength,
      fix: rule.fix,
      matchedText,
      excerpt: excerptFor(text, index, matchedText.length),
      index,
      length: matchedText.length
    };
  }

  function collectBuzzwordClusterEvidence(text, evidence) {
    const buzzwords = evidence.filter((item) => item.ruleId === "buzzword");
    const uniqueWords = new Set(buzzwords.map((item) => item.matchedText.toLowerCase()));
    if (uniqueWords.size < 2) {
      return [];
    }
    const first = buzzwords[0];
    return [
      customEvidence(
        {
          id: "buzzword-cluster",
          name: "Buzzword cluster",
          family: "buzzword-cluster",
          strength: STRENGTH.MEDIUM,
          fix: "Replace the cluster with concrete facts and direct verbs."
        },
        text,
        first.index,
        [...uniqueWords].join(", ")
      )
    ];
  }

  function collectQuestionAnswerEvidence(text) {
    const match = /(?:^|[.!]\s+)([^?\n]{4,90}\?)\s+([A-Z0-9][^?!\n]{2,100}[.!])/u.exec(text);
    if (!match) {
      return [];
    }
    const matchedText = `${match[1]} ${match[2]}`;
    const index = match.index + match[0].indexOf(match[1]);
    return [
      customEvidence(
        {
          id: "self-answered-question",
          name: "Self-answered rhetorical question",
          family: "rhetorical-setup",
          strength: STRENGTH.MEDIUM,
          fix: "State the answer directly."
        },
        text,
        index,
        matchedText
      )
    ];
  }

  function collectRoboticRhythmEvidence(text) {
    const sentences = [...text.matchAll(/[^.!?\n]+[.!?]/gu)].map((match) => ({
      index: match.index,
      text: match[0].trim(),
      words: (match[0].match(/[\p{L}\p{N}'’]+/gu) || []).length
    }));

    for (let index = 0; index <= sentences.length - 3; index += 1) {
      const run = sentences.slice(index, index + 3);
      const counts = run.map((sentence) => sentence.words);
      if (counts.every((count) => count >= 2 && count <= 6) && Math.max(...counts) - Math.min(...counts) <= 2) {
        const matchedText = run.map((sentence) => sentence.text).join(" ");
        return [
          customEvidence(
            {
              id: "robotic-rhythm",
              name: "Robotic rhythm",
              family: "robotic-rhythm",
              strength: STRENGTH.MEDIUM,
              fix: "Vary the sentence shapes only where it helps the point."
            },
            text,
            run[0].index,
            matchedText
          )
        ];
      }
    }
    return [];
  }

  function collectFormattingSlopEvidence(text) {
    const lines = text.split("\n");
    const decorativeLines = lines.filter((line) =>
      /^\s*(?:[-•▪◦]|[✅🚀🔥💡⚡👉🎯])\s+/u.test(line)
    );
    if (decorativeLines.length < 3) {
      return [];
    }
    const matchedText = decorativeLines.slice(0, 3).join(" ").trim();
    return [
      customEvidence(
        {
          id: "decorative-list",
          name: "Formatting slop",
          family: "formatting-slop",
          strength: STRENGTH.MEDIUM,
          fix: "Use formatting only when the content needs a list."
        },
        text,
        text.indexOf(decorativeLines[0]),
        matchedText
      )
    ];
  }

  function looksLikeMetaDiscussion(text) {
    const hasMetaLanguage =
      /\b(?:AI slop|AI writing|writing pattern|clich(?:e|é)|avoid (?:saying|writing)|don(?:'|’)t (?:say|write)|phrase)\b/iu.test(
        text
      );
    const quoteMarks = (text.match(/["“”‘’']/gu) || []).length;
    return hasMetaLanguage && quoteMarks >= 2;
  }

  function classify(evidence, sensitivity) {
    const familiesByStrength = {
      [STRENGTH.STRONG]: new Set(),
      [STRENGTH.MEDIUM]: new Set(),
      [STRENGTH.SUPPORT]: new Set()
    };

    for (const item of evidence) {
      familiesByStrength[item.strength].add(item.family);
    }

    const strong = familiesByStrength[STRENGTH.STRONG].size;
    const medium = familiesByStrength[STRENGTH.MEDIUM].size;
    const support = familiesByStrength[STRENGTH.SUPPORT].size;

    let isSlop;
    switch (sensitivity) {
      case "sensitive":
        isSlop = strong >= 1 || medium >= 1 || support >= 2;
        break;
      case "balanced":
        isSlop = strong >= 1 || medium >= 1 || support >= 2;
        break;
      case "conservative":
      default:
        isSlop = strong >= 1 || medium >= 2;
        break;
    }

    const confidence =
      strong >= 2 || (strong >= 1 && medium >= 1) || medium >= 3
        ? "high"
        : isSlop
          ? "supported"
          : "insufficient";

    return {
      isSlop,
      confidence,
      counts: { strong, medium, support }
    };
  }

  function detectSlop(input, options) {
    const text = String(input || "").trim();
    const sensitivity = options?.sensitivity || "conservative";

    if (text.length < 18) {
      return {
        isSlop: false,
        confidence: "insufficient",
        evidence: [],
        families: [],
        reason: "too-short"
      };
    }

    const evidence = RULES.flatMap((rule) => collectRuleEvidence(rule, text));
    evidence.push(...collectEmDashEvidence(text));
    evidence.push(...collectBuzzwordClusterEvidence(text, evidence));
    evidence.push(...collectQuestionAnswerEvidence(text));
    evidence.push(...collectRoboticRhythmEvidence(text));
    evidence.push(...collectFormattingSlopEvidence(text));
    evidence.sort((left, right) => left.index - right.index || left.ruleId.localeCompare(right.ruleId));

    const classification = classify(evidence, sensitivity);
    const metaDiscussion = looksLikeMetaDiscussion(text);
    const isSlop = metaDiscussion ? false : classification.isSlop;
    const visibleEvidence = evidence.slice(0, 8);

    return {
      isSlop,
      confidence: isSlop ? classification.confidence : "insufficient",
      evidence: visibleEvidence,
      families: [...new Set(evidence.map((item) => item.family))],
      reason: metaDiscussion ? "meta-discussion" : evidence.length ? "evaluated" : "no-patterns",
      counts: classification.counts
    };
  }

  return {
    RULES,
    STRENGTH,
    classify,
    detectSlop
  };
});
