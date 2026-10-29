import { ProxyAgent, fetch as undiciFetch, type RequestInit, type Response } from 'undici';
import { z } from 'zod';

// The only way this app (web and worker) talks to the outside world: always through the VPN's HTTP proxy.
let dispatcher: ProxyAgent | undefined;

export function outboundFetch(url: string, init: RequestInit = {}): Promise<Response> {
  dispatcher ??= new ProxyAgent(z.url().parse(process.env.EGRESS_PROXY_URL));
  return undiciFetch(url, { ...init, dispatcher });
}
