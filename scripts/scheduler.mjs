// Independent of browser and frontend; use Node 24 --env-file=.env.scheduler.
const origin=process.env.RADAR_ORIGIN||'http://127.0.0.1:5173';
const secret=process.env.SCHEDULER_SECRET;
if(!secret||secret.length<32)throw new Error('Set SCHEDULER_SECRET (at least 32 characters) in the worker and scheduler environments.');
const delay=Number(process.env.TICK_INTERVAL_MS||15000);
if(!Number.isFinite(delay)||delay<1000)throw new Error('TICK_INTERVAL_MS must be >= 1000');
let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
do {
  try {
    const r=await fetch(new URL('/api/radar/tick',origin),{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(55000)});
    const body=await r.json();
    console.log(JSON.stringify({at:new Date().toISOString(),status:r.status,checked:body.checked??null,error:body.error??null}));
  }catch{console.error(JSON.stringify({at:new Date().toISOString(),error:'Scheduler request failed; will retry'}));}
  if(process.argv.includes('--once'))break;
  await new Promise(resolve=>setTimeout(resolve,delay));
}while(!stopped);
