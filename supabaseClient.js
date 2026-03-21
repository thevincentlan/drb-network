/**
 * supabaseClient.js
 * 
 * Initializes the Supabase client for the browser.
 */

const SUPABASE_URL = 'https://lcbylepuimqramwuqmxi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjYnlsZXB1aW1xcmFtd3VxbXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjk4NDYsImV4cCI6MjA4OTUwNTg0Nn0.7kgdiw8fzUwniL7s2IVKe-5qJkeJficF-iSPNSLQ8r8';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Supabase browser library failed to load.');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration is missing.');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
