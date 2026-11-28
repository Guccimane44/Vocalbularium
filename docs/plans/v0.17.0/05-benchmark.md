# Step 5: Benchmark the candidate models (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts. **Only for the facets step 4 leaves short of the bar** ([master plan](README.md#is-the-picker-still-needed)); skipped if none.

Run the same golden set, same samples and same judge with Gemini 4 Argon, Kimi K3.1 Pro and Qwen4 Max on Go. Record per-facet results, time, cost, and failures to finish, with and without references on the assisted facets, as in [step 4](04-baseline.md). Raise the token limit for any model that cuts cards off. No Zen models (owner, 2026-11-24).

**Check:** each number comes with its sample size. A gap between models counts only if it is larger than the run-to-run spread from [step 4](04-baseline.md).
