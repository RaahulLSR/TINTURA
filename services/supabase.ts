import { createClient } from '@supabase/supabase-js';

// Parsed from your connection string
const PROJECT_URL = 'https://hvrtjbdofmjdbncthnqq.supabase.co';

// ⚠️ IMPORTANT: You must replace this with your actual Anon Key from Supabase Dashboard -> Project Settings -> API
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2cnRqYmRvZm1qZGJuY3RobnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjI3MzYsImV4cCI6MjA4MTI5ODczNn0.zaPU-GAdsXGzX2fr7ddiMVjTr-zz1vi6OEP6ylOUagQ'; 

// Safe environment variable access for both Vite/Node and raw Browser environments
const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    // process is not defined, ignore
  }
  return undefined;
};

const SUPABASE_URL = getEnv('REACT_APP_SUPABASE_URL') || PROJECT_URL;
const SUPABASE_KEY = getEnv('REACT_APP_SUPABASE_ANON_KEY') || DEFAULT_KEY;

if (SUPABASE_KEY === 'INSERT_YOUR_SUPABASE_ANON_KEY_HERE') {
  console.warn("⚠️ Supabase Anon Key is missing! The app is running in Mock Mode. Please update services/supabase.ts");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);