### Q22
Q22 Answer: Serverless on Vercel, scale-to-zero allowed.
We run the API as Vercel Functions. When no one uses it, it goes to zero. When requests come, Vercel starts as many copies as needed.
What we accept with this:
1. No saved files on the computer. If the backend dies mid-generation, the result is lost. This is okay because generation is cheap — the user just clicks generate again. No replay from disk.
2. Many copies can run at once. We do NOT stay with one writer for the whole database. Long-term we want one ordered line per user, so users don't block each other. Details in Q26.
3. We still need to check the timeout. Generation can take up to 60 seconds. We will test cold start + full generation time on our Vercel plan and move to background jobs if the plan stops functions too early.

### Q23