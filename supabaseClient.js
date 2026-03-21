/**
 * supabaseClient.js
 * 
 * Initializes the Supabase client for the browser.
 */

const SUPABASE_URL = 'https://lcbylepuimqramwuqmxi.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual Public Anon Key from Supabase Settings -> API

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
