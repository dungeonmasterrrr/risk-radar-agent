import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';
const contents = `
import { requestModelDraft } from '../core/models.mjs';
export default { async fetch(request) {
  const url=new URL(request.url),provider=url.searchParams.get('provider');
  const env=provider==='gemini'?{MODEL_PROVIDER:'gemini',GEMINI_API_KEY:'fake-runtime-test-key'}:{MODEL_PROVIDER:'openai',MODEL_API_KEY:'fake-runtime-test-key',MODEL_NAME:'test-model'};
  let calls=0;
  try {
    const result=await requestModelDraft('test','test',{type:'object'},env,async(url,options)=>{
      calls++;
      // Constructs a real workerd Request, unlike Node-only fetch mocks.
      const outgoing=new Request(url,options);
      if(outgoing.redirect!=='manual')throw new Error('unsafe redirect handling');
      if(new URL(request.url).searchParams.has('redirect'))return new Response(null,{status:302,headers:{Location:'https://other.example'}});
      return provider==='gemini'?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}):Response.json({output:[{content:[{type:'output_text',text:'{}'}]}]});
    });
    return Response.json({ok:true,provider:result.provider,calls});
  } catch(error) { return Response.json({ok:false,code:error.code,calls}); }
}};`;
async function runtime(){return new Miniflare({modules:[{type:'ESModule',path:resolve('tests/model-worker-entry.mjs'),contents},{type:'ESModule',path:resolve('core/models.mjs')}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false});}
test('模型请求在真实 Worker 运行时可构造，Gemini 与原有提供方均受保护',async()=>{const mf=await runtime();try{for(const provider of ['gemini','openai']){const r=await(await mf.dispatchFetch(`http://localhost/?provider=${provider}`)).json();assert.deepEqual(r,{ok:true,provider,calls:1});}}finally{await mf.dispose();}});
test('模型接口重定向被拒绝，不把密钥转发到新地址',async()=>{const mf=await runtime();try{for(const provider of ['gemini','openai']){const r=await(await mf.dispatchFetch(`http://localhost/?provider=${provider}&redirect=1`)).json();assert.deepEqual(r,{ok:false,code:'upstream_error',calls:1});}}finally{await mf.dispose();}});
