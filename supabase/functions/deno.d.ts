// Ambient type definitions for Supabase Edge Functions (Deno runtime)
// Resolves editor TypeScript errors when viewing Edge Functions in Node-centric IDEs.

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  export const env: Env;

  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
    options?: { port?: number }
  ): void;
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
    options?: { port?: number }
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient<T = any>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: any
  ): any;
}

declare module 'npm:livekit-server-sdk' {
  export interface VideoGrant {
    roomJoin?: boolean;
    room?: string;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    hidden?: boolean;
    recorder?: boolean;
  }

  export interface AccessTokenOptions {
    identity?: string;
    name?: string;
    metadata?: string;
    ttl?: string | number;
  }

  export class AccessToken {
    constructor(apiKey: string, apiSecret: string, options?: AccessTokenOptions);
    addGrant(grant: VideoGrant): void;
    toJwt(): Promise<string>;
  }
}
