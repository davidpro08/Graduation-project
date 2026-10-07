import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly url: string;
  private readonly key: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY가 필요합니다.');
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('SUPABASE_URL이 유효하지 않습니다.');
    if (!key.startsWith('sb_publishable_')) throw new Error('SUPABASE_PUBLISHABLE_KEY에는 publishable 키가 필요합니다.');
    this.url = url;
    this.key = key;
  }

  forUser(token: string) {
    return createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    });
  }
}
