# Expertise insight: a blind ranking of four prompt versions

24 October 2026 (Europe/Berlin). The source of [D16](../../architecture/traceability-map.md#entries). The owner found the Expertise output bland: "retinol" in Mathematics got a decent general explanation, and "multi-core" read almost the same in Mathematics and in Computer Science. The owner proposed a control flow in generation (for example, a formula only when the concept has one). This test asks what would make the output more insightful before choosing a mechanism.

## Diagnosis tested

Both core prompts end with "When it has no meaning in mathematics [computer science], say so in one sentence and explain what it means", so a key outside the subject gets its general meaning, which is why the two modules can read alike. Both also share one template (what it means, why it matters, an example) and differ only in "as mathematics understands it". The model could also be a limit.

## Method

Eight keys, each through both modules (16 cards), in English, one sample per version, OpenCode Go:

- **central:** derivative, eigenvalue (Mathematics), recursion, cache (Computer Science);
- **adjacent:** multi-core (Computer Science, adjacent to Mathematics), entropy (both);
- **unrelated:** retinol, 幸福.

Four versions of the core prompt; the composer's other parts (facets line, shared rules, writing guide) unchanged:

- **A:** today's prompt, `deepseek-v4.1-flash`.
- **B:** "what does the subject have to say about the selection": a short description of how the subject explains (Mathematics: definitions, structure, a formula when the concept has one, intuition; Computer Science: mechanism, trade-offs, where it sits in a system), the subject's angle on a term from another field, and one sentence and nothing else when the subject has nothing real to say.
- **C:** B, with the model also judging the key's relevance (central, angle or none).
- **D:** C on `deepseek-v4-pro`.

The owner ranked the four answers of each card blind, marked each fine or not fine on a card, and could flag errors and leave a note, on a private judging page (versions shuffled per card, revealed only afterwards). The outputs, the key and the judging page's data are kept locally in `.data/insight-2026-10-24/` (not committed).

## Results

The owner judged 13 of 16 cards: 5 fully ranked, 8 partly ranked or marked only.

| Version | Answers ranked | Average rank (1 = best) | Ranked 1st | Fine / not fine |
| --- | --- | --- | --- | --- |
| A: today's prompt | 9 | 1.78 | 6 | 11 / 2 |
| B: the subject's angle | 8 | 2.50 | 2 | 8 / 4 |
| C: B + relevance | 5 | 3.40 | 0 | 7 / 5 |
| D: C on a stronger model | 7 | 2.71 | 1 | 8 / 5 |

- **Central keys.** Today's prompt ranked first for derivative in both modules and eigenvalue in both modules.
- **Adjacent keys.** For multi-core and cache in Mathematics, B, C and D brought in Amdahl's law and average access times; the owner marked those not fine and ranked today's answer ("multi-core has no specific meaning in mathematics", then a plain explanation of the computing term) first. The owner's reason: Amdahl's law "is too obscure. It feels forced."
- **Unrelated keys.** Today's general explanation of retinol (vitamin chemistry) came last and not fine in both modules; the short honest answers were fine. For 幸福 in Mathematics, today's answer, which named happy numbers (a real mathematical term built on the word), ranked first.
- **Model.** The stronger model did not beat the same prompt on the faster one.

## Conclusion

The shared template is not what made the output bland where the owner judged it: a subject lens and an instruction to find the subject's angle made answers forced and obscure. A control flow would have served those angles, so it has no support. The one change the ranking supports is narrow: an unrelated key gets an honest line instead of its general meaning, a technical term from a neighbouring field is named as such and explained briefly, and no answer forces a connection. An established term of the subject built on the word may still be named.

## Limits

One owner, 13 partly judged cards, one sample per version, English only. Differences between B, C and D are within noise; the gaps between A and the others on central and adjacent keys, and the rejection of the general-meaning fallback for retinol, are the robust ones.
