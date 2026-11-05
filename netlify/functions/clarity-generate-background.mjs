import { runtime, runJob, validJob } from '../lib/live.mjs';
import { narrate } from '../lib/narration.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return;
  let job;
  try { job = await request.json(); }
  catch { return; }
  const {id,attempt} = job || {};
  if (validJob(process.env.DEEPSEEK_API_KEY,id,attempt,request.headers.get('x-clarity-job'))) {
    await runJob(runtime(),id,attempt,narrate);
  }
}
