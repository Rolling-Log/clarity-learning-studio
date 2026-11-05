import { runtime, runJob, validJob } from '../lib/live.mjs';
import { narrate } from '../lib/narration.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return {statusCode:405,body:''};
  let job;
  try { job = JSON.parse(event.body || '{}'); }
  catch { return {statusCode:400,body:''}; }
  const {id,attempt} = job || {};
  if (!validJob(process.env.DEEPSEEK_API_KEY,id,attempt,event.headers?.['x-clarity-job'])) {
    return {statusCode:401,body:''};
  }
  await runJob(runtime(event),id,attempt,narrate);
  return {statusCode:204,body:''};
}
