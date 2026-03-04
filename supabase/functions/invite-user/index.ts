// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing Supabase environment variables' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ ok: false, error: 'Missing authorization header' }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerErr
  } = await userClient.auth.getUser();

  if (callerErr || !caller) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (profileErr || callerProfile?.role !== 'admin') {
    return json({ ok: false, error: 'Forbidden: admin access required' }, 403);
  }

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    role?: 'admin' | 'manager' | 'staff' | 'cashier';
    is_active?: boolean;
    store_ids?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password || '';
  const fullName = body.full_name?.trim();
  const role = body.role || 'cashier';
  const isActive = body.is_active !== false;
  const storeIds = Array.isArray(body.store_ids) ? body.store_ids : [];

  if (!email || !fullName) {
    return json({ ok: false, error: 'Email and full_name are required' }, 400);
  }

  if (password.length < 6) {
    return json({ ok: false, error: 'Password must be at least 6 characters' }, 400);
  }

  if (!['admin', 'manager', 'staff', 'cashier'].includes(role)) {
    return json({ ok: false, error: 'Invalid role' }, 400);
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });

  if (createErr || !created.user) {
    return json({ ok: false, error: createErr?.message || 'Failed to create user' }, 400);
  }

  const userId = created.user.id;

  const { error: upsertErr } = await adminClient
    .from('profiles')
    .upsert({ id: userId, full_name: fullName, role, is_active: isActive });

  if (upsertErr) {
    return json({ ok: false, error: upsertErr.message }, 400);
  }

  const username = email.split('@')[0].toLowerCase();
  const { error: loginUserErr } = await adminClient
    .from('login_users')
    .upsert({ user_id: userId, username, email, role, is_active: isActive }, { onConflict: 'email' });

  if (loginUserErr) {
    return json({ ok: false, error: loginUserErr.message }, 400);
  }

  const { error: clearAccessErr } = await adminClient
    .from('user_store_access')
    .delete()
    .eq('user_id', userId);

  if (clearAccessErr) {
    return json({ ok: false, error: clearAccessErr.message }, 400);
  }

  if (role !== 'admin' && storeIds.length > 0) {
    const rows = storeIds.map((storeId) => ({ user_id: userId, store_id: storeId }));
    const { error: accessErr } = await adminClient.from('user_store_access').insert(rows);
    if (accessErr) {
      return json({ ok: false, error: accessErr.message }, 400);
    }
  }

  return json({ ok: true, user_id: userId });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
