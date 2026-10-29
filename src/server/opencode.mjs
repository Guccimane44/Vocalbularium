import { failure, Provider } from './provider.mjs';

// The OpenCode adapter (D11): transport only. OpenCode has no native JSON
// schema, so the schema travels inside the instructions.
export class OpenCodeProvider extends Provider {
  nativeSchema = false;
  constructor({ apiKey = process.env.OPENCODE_API_KEY, model = process.env.OPENCODE_MODEL ?? 'deepseek-v4.1-flash', fetchImpl = fetch } = {}) {
    super();
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl;
  }
  prompts(request) {
    return [
      { role: 'system', content: `${request.instructions}\nReturn exactly one JSON object for ${request.name}, with no surrounding text or code fences. Match this JSON schema: ${JSON.stringify(request.schema)}` },
      { role: 'user', content: JSON.stringify(request.input) }
    ];
  }
  async send(request, messages, signal, sessionId, reply) {
    if (!this.apiKey) throw failure('provider_unconfigured', 'Generation is not configured on the server.');
    const response = await this.fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST', headers: {
        Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json',
        'User-Agent': 'Vocabularium/0.13.1', 'x-opencode-session': sessionId
      },
      body: JSON.stringify({ model: this.model, stream: false, max_tokens: request.maxTokens, messages }),
      signal
    });
    reply.status = response.status;
    reply.raw = await response.text();
    if (!response.ok) throw failure('provider_response', 'The generation service could not complete this request.');
    let result;
    try { result = JSON.parse(reply.raw); } catch { throw failure('provider_invalid', 'Generation returned an invalid result.'); }
    const choice = result?.choices?.[0];
    if (result?.error || !Array.isArray(result?.choices) || result.choices.length !== 1 || choice?.finish_reason !== 'stop') {
      throw failure('provider_incomplete', 'Generation returned an incomplete result.');
    }
    const message = choice.message;
    if (message?.role !== 'assistant' || message.refusal || message.tool_calls?.length || message.function_call) {
      throw failure('provider_refused', 'The generation service did not produce this content.');
    }
    reply.content = message.content;
  }
}
