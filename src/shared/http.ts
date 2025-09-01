import axios from 'axios';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

// ⚠️ só alteramos tuning; mesmas funções/rotas
export const axiosSienge = axios.create({
  baseURL: process.env.SIENGE_BASE_URL!,
  auth: { username: process.env.SIENGE_USER!, password: process.env.SIENGE_PASS! },

  // timeouts mais curtos por request (evita “pendurado”)
  timeout: 4000,

  // keep-alive + mais conexões simultâneas
  httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 128, scheduling: 'lifo' as any }),
  httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 128, scheduling: 'lifo' as any }),

  // deixamos tratar manualmente 4xx/5xx
  validateStatus: () => true,
});

// Retry leve com jitter exponencial
axiosSienge.interceptors.response.use(undefined, async (error) => {
  const cfg: any = error.config || {};
  const status = error?.response?.status;
  const netErr = ['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(error?.code);

  if (!netErr && ![429,500,502,503,504].includes(status)) throw error;

  cfg.__retryCount = (cfg.__retryCount || 0) + 1;
  if (cfg.__retryCount > 2) throw error;

  const base = 400;
  const jitter = Math.floor(Math.random() * 200);
  const delayMs = Math.min(base * 2 ** cfg.__retryCount + jitter, 3500);
  await new Promise(r => setTimeout(r, delayMs));
  return axiosSienge(cfg);
});
