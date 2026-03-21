/**
 * setup_db.js
 * 
 * This script connects to your Supabase PostgreSQL database and runs
 * the schema defined in supabase_schema.sql.
 * 
 * Usage:
 * 1. Ensure DATABASE_URL is set in .env
 * 2. Run: node scripts/setup_db.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const schemaPath = '/Users/vincentlan/.gemini/antigravity/brain/e84f6433-6b78-4ac9-bdbe-dd03c138beeb/supabase_schema.sql';

async function setup() {
    console.log('--- DRB Network: Database Setup Started ---');
    
    if (!process.env.DATABASE_URL) {
        console.error('Error: DATABASE_URL not found in .env');
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL');

        const sql = fs.readFileSync(schemaPath, 'utf8');
        console.log('Reading schema from supabase_schema.sql...');

        await client.query(sql);
        console.log('Schema applied successfully!');

    } catch (err) {
        console.error('Error applying schema:', err.message);
    } finally {
        await client.end();
        console.log('Connection closed');
    }
}

setup();
