/**
 * supabaseClient.js
 * 
 * Initializes the Supabase client for the browser.
 */

const SUPABASE_URL = 'https://lcbylepuimqramwuqmxi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjYnlsZXB1aW1xcmFtd3VxbXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjk4NDYsImV4cCI6MjA4OTUwNTg0Nn0.7kgdiw8fzUwniL7s2IVKe-5qJkeJficF-iSPNSLQ8r8'; // Replace with your actual Public Anon Key from Supabase Settings -> API

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
