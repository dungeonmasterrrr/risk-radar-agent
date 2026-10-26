export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
export class ModelError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
// Public configuration contains no credentials. Gemini is preferred when its key
// is present; provider selection never falls through to a paid provider on error.
export function modelConfiguration(env = {}) {
  const provider = env.MODEL_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'openai');
  if (!['gemini', 'openai'].includes(provider)) return { provider: 'unknown', name: null, configured: false };
  const name = provider === 'gemini' ? env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL : env.MODEL_NAME || null;
  const valid = typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(name);
  return { provider, name: valid ? name : null, configured: !!(valid && (provider === 'gemini' ? env.GEMINI_API_KEY : env.MODEL_API_KEY)) };
}
function statusError(status) {
  if (status === 429) return new ModelError('rate_limited', '模型额度或速率受限，请稍后重试；不会自动切换到其他模型');
  if ([401, 403].includes(status)) return new ModelError('access_denied', '模型密钥、权限或服务地区校验未通过');
  if (status === 404) return new ModelError('model_unavailable', '当前账号无法使用所配置的模型，请检查模型名称与权限');
  return new ModelError('upstream_error', `模型服务返回 HTTP ${status}；未暴露上游响应内容`);
}
export async function requestModelDraft(input, instructions, schema, env, fetcher = fetch) {
  const config = modelConfiguration(env);
  if (!config.configured) throw new ModelError('unconfigured', '模型配置不完整');
  try {
    let response, output;
    if (config.provider === 'gemini') {
      response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${config.name}:generateContent`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(25000),
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json', responseJsonSchema: schema },
        }),
      });
      if (!response.ok) throw statusError(response.status);
      const body = await response.json();
      const candidate = body.candidates?.[0];
      if (body.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') throw new ModelError('blocked', '模型拒绝处理该输入，请修改关注描述');
      if (!candidate || candidate.finishReason !== 'STOP') throw new ModelError('incomplete', '模型未返回完整规则，本次不使用截断输出');
      output = candidate.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
    } else {
      response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${env.MODEL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.name, store: false, instructions, input, text: { format: { type: 'json_schema', name: 'monitor_draft', strict: true, schema } }, max_output_tokens: 2200 }),
      });
      if (!response.ok) throw statusError(response.status);
      const body = await response.json();
      output = body.output?.flatMap(item => item.content || []).find(part => part.type === 'output_text')?.text;
    }
    try { return { draft: JSON.parse(output), provider: config.provider, model: config.name }; }
    catch { throw new ModelError('invalid_output', '模型返回的内容不是有效规则 JSON'); }
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (['AbortError', 'TimeoutError'].includes(error?.name)) throw new ModelError('timeout', '模型请求超时，请稍后重试');
    throw new ModelError('network', '模型网络请求或响应解析失败，请检查服务可达性');
  }
}
