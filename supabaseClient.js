/**
 * supabaseClient.js
 * 
 * Initializes the Supabase client for the browser.
 */

const SUPABASE_URL = 'https://lcbylepuimqramwuqmxi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjYnlsZXB1aW1xcmFtd3VxbXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjk4NDYsImV4cCI6MjA4OTUwNTg0Nn0.7kgdiw8fzUwniL7s2IVKe-5qJkeJficF-iSPNSLQ8r8';

const inMemoryStorage = (() => {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
})();

function getBrowserStorage() {
    try {
        const testKey = '__drb_supabase_storage_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return window.localStorage;
    } catch (error) {
        console.warn('Supabase auth storage unavailable, using in-memory fallback.', error);
        return inMemoryStorage;
    }
}

try {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase browser library failed to load.');
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration is missing.');
    }

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: getBrowserStorage()
        }
    });

    window.supabaseClient = supabaseClient;
} catch (error) {
    window.supabaseInitError = error;
    console.error('Failed to initialize Supabase client.', error);
}
