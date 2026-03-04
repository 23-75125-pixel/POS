// src/js/supabaseClient.js
// Configure your Supabase credentials here

const SUPABASE_URL = window.POS_CONFIG?.supabaseUrl || 'https://rbtxjibqbwkfmeyxtbrc.supabase.co';
const SUPABASE_ANON_KEY = window.POS_CONFIG?.supabaseAnonKey || 'sb_publishable_TA_6jIwx6sFvRYrdlckNmQ_9SDms1HV';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export default db;
