/**
 * migrate_to_supabase.js
 * 
 * This script migrates your DRB Network data from CSV exports to Supabase.
 * It uses the exact same normalization and parsing logic as app.js.
 * 
 * Usage:
 * 1. Export both Google Sheets as CSV: 'old_data.csv' and 'new_data.csv'.
 * 2. Save them in the 'data/' directory.
 * 3. Set environment variables:
 *    export SUPABASE_URL='https://YOUR_PROJECT_ID.supabase.co'
 *    export SUPABASE_KEY='YOUR_SERVICE_ROLE_KEY'
 * 4. Run: node scripts/migrate_to_supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Papa = require('papaparse');
require('dotenv').config();

// Import your existing config.js normalization maps
const config = require('../config.js');

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Normalization Helpers (Copied/Adapted from app.js) ---

function normalizeName(name, map) {
    if (!name) return '';
    const lowerName = name.trim().toLowerCase();
    const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
    
    for (const key of sortedKeys) {
        if (lowerName === key.toLowerCase()) return map[key];
    }
    for (const key of sortedKeys) {
        const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lowerName)) { return map[key]; }
    }

    const exceptions = ['of', 'a', 'the', 'and', 'an', 'in', 'on', 'at', 'for'];
    return name.trim().split(/\s+/).map((word, index) => {
        const lowerWord = word.toLowerCase();
        if (index > 0 && exceptions.includes(lowerWord)) { return lowerWord; }
        if (word.includes('&')) {
            return word.split('&').map(part => {
                if (!part) return '';
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }).join('&');
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

// --- HEADER MAPPING (From app.js) ---

const NEW_HEADERS = {
    firstName: 'First Name', lastName: 'Last Name', gradYear: 'ERHS Graduation Year',
    photoUrl: 'Upload a photo for your profile (current photo)', drbPhotoUrl: 'Upload a photo of you on DRB',
    greek: 'Greek Affiliation', military: 'Military Branch', leadership: 'Leadership Positions Held',
    tenure: 'Tenure on DRB (Years)', awards: 'DRB Awards',
    favoriteStep: 'Favorite Step', 
    city: 'Location', cityAlt: 'Which city do you live in now?',
    occupation: 'What\'s your occupation or what industry are you in?',
    rank: 'Military Rank', about: 'Anything else you want to add about yourself (accolades, shameless plugs, advice, etc)',
    email: 'Email (required to access the database)', phone: 'Phone Number', 
    instagram: 'Instagram (join our group chat if you\'re not already in)',
    consent: 'Contact Sharing Preferences with Other Alumni',
    newEduUni: 'Education - University (list each on a new line if multiple)',
    newEduMajor: 'Education - Major(s) (list each on a new line if multiple)',
    newEduDegree: 'Education - Degree (list each on a new line if multiple)',
    newEduGradYear: 'Education - Graduation Year (list each on a new line if multiple)',
    newSocialType: 'Social Media - Type (LinkedIn, YouTube, etc)',
    newSocialUrl: 'Social Media - Handle/URL',
    newWebsiteType: 'Website - Type (Organization, Portfolio, etc)',
    newWebsiteUrl: 'Website URL'
};

const OLD_HEADERS = {
    firstName: 'Name - First Name', lastName: 'Name - Last Name', gradYear: 'ERHS Graduation Year',
    photoUrl: 'Upload a photo for your profile (current photo)', drbPhotoUrl: 'Upload a photo of you on DRB',
    greek: 'Greek Affiliation', military: 'Military', leadership: 'Leadership Positions Held',
    education: 'Education (can add multiple)', tenure: 'Tenure on DRB (Years)', awards: 'DRB Awards',
    favoriteStep: 'Favorite Step', 
    city: 'Location', cityAlt: 'Which city do you live in now?',
    occupation: 'What\'s your occupation or what industry are you in?',
    rank: 'Military Rank', about: 'Anything else you want to add about yourself (accolades, shameless plugs, advice, etc)',
    email: 'Email', phone: 'Phone Number', 
    instagram: 'Instagram (join our group chat if you’re not already in)',
    consent: 'I am okay with having my contact shared so other DRB alumni can contact me (networking, mentoring, etc.)',
    socialMedia: 'Social Media', websites: 'Websites'
};

const hasData = (value) => value && value.toLowerCase() !== 'n/a' && value !== '';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMh0iDxIrWzo6RsDDG3fZAA_MIWiz2ogijCmBAFWvbImzaLJePk59yJlQE-yjGL5KXRA/exec';

async function migrate() {
    console.log('--- DRB Network: Migration Started ---');

    let oldData, newData;

    if (fs.existsSync('./data/old_data.csv') && fs.existsSync('./data/new_data.csv')) {
        console.log('Using local CSV files from ./data/');
        oldData = parseCsv('./data/old_data.csv');
        newData = parseCsv('./data/new_data.csv');
    } else {
        console.log('Fetching data directly from Google Apps Script...');
        try {
            const response = await fetch(`${APPS_SCRIPT_URL}?action=admin_login`);
            const json = await response.json();
            if (!json.success) throw new Error(json.error || 'Failed to fetch from Google');
            
            oldData = Papa.parse(json.csvOld, { header: true, skipEmptyLines: true }).data;
            newData = Papa.parse(json.csvNew, { header: true, skipEmptyLines: true }).data;
            console.log(`Raw Old Rows: ${oldData.length}`);
            console.log(`Raw New Rows: ${newData.length}`);
            console.log('Sample Row Keys:', Object.keys(oldData[0] || {}));
            console.log('Sample First Name:', oldData[0]?.['Name - First Name'] || oldData[0]?.['First Name']);
            console.log('Data fetched successfully!');
        } catch (err) {
            console.error('Error fetching data:', err.message);
            console.log('Please ensure you have exported CSVs to ./data/ as a fallback.');
            return;
        }
    }

    console.log(`Processing Old: ${oldData.length} New: ${newData.length}`);

    const alumniMap = new Map();

    // Process Sheets
    processRows(oldData, OLD_HEADERS, false, alumniMap);
    processRows(newData, NEW_HEADERS, true, alumniMap);

    console.log(`Unique records to migrate: ${alumniMap.size}`);

    for (const [key, alum] of alumniMap.entries()) {
        try {
            // 1. Insert Alumnus
            const { data: alumData, error: alumError } = await supabase
                .from('alumni')
                .upsert({
                    first_name: alum.firstName,
                    last_name: alum.lastName,
                    grad_year: parseInt(alum.gradYear) || 0,
                    email: alum.email || null,
                    phone: alum.phone,
                    city: alum.city,
                    state: alum.state,
                    occupation: alum.occupation,
                    industry: alum.industry,
                    tenure: parseInt(alum.tenure) || null,
                    favorite_step: alum.favoriteStep,
                    about: alum.about,
                    photo_url: alum.photoUrl,
                    drb_photo_url: alum.drbPhotoUrl,
                    military_branch: alum.militaryBranch,
                    military_rank: alum.militaryRank
                }, { onConflict: 'first_name, last_name, grad_year' })
                .select()
                .single();

            if (alumError) throw alumError;
            const alumnusId = alumData.id;

            // 2. Clear sub-tables (if upserting)
            await supabase.from('alumni_education').delete().eq('alumnus_id', alumnusId);
            await supabase.from('alumni_links').delete().eq('alumnus_id', alumnusId);
            await supabase.from('alumni_awards').delete().eq('alumnus_id', alumnusId);
            await supabase.from('alumni_leadership').delete().eq('alumnus_id', alumnusId);

            // 3. Insert Relational Data
            for (const edu of alum.educationHistory) {
                const { data: eduData, error: eduError } = await supabase
                    .from('alumni_education')
                    .insert({
                        alumnus_id: alumnusId,
                        university: edu.university,
                        degree: edu.degrees.join(', '),
                        grad_year: parseInt(edu.gradYear) || null
                    })
                    .select()
                    .single();

                if (eduError) throw eduError;

                if (edu.majors && edu.majors.length > 0) {
                    await supabase.from('education_majors').insert(
                        edu.majors.map(m => ({ education_id: eduData.id, major_name: m.normalized }))
                    );
                }
            }

            // Socials
            const links = [...alum.socialMedia, ...alum.websites];
            if (links.length > 0) {
                await supabase.from('alumni_links').insert(
                    links.map(l => ({ alumnus_id: alumnusId, type: l.type, url: l.url, display_text: l.display, is_social: !!l.is_social }))
                );
            }

            // Awards / Leadership
            if (alum.awards && alum.awards.length > 0) {
                await supabase.from('alumni_awards').insert(alum.awards.map(a => ({ alumnus_id: alumnusId, award_name: a })));
            }
            if (alum.leadership && alum.leadership.length > 0) {
                await supabase.from('alumni_leadership').insert(alum.leadership.map(l => ({ alumnus_id: alumnusId, position_name: l })));
            }

            console.log(`Success: ${alum.firstName} ${alum.lastName} (${alum.email || 'No email'})`);
        } catch (err) {
            console.error(`Failed ${alum.firstName} ${alum.lastName}:`, err.message);
        }
    }

    console.log('--- Migration Finished ---');
}

function parseCsv(file) {
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8');
    return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function processRows(rows, headerMap, isNew, map) {
    rows.forEach(row => {
        const getCell = (key) => row[headerMap[key]]?.trim() || '';
        
        const firstName = getCell('firstName');
        const lastName = getCell('lastName');
        const gradYear = getCell('gradYear');
        const email = getCell('email')?.toLowerCase() || null;

        if (!firstName || !lastName || !gradYear) return;

        const uniqueKey = `${firstName}-${lastName}-${gradYear}`.toLowerCase().replace(/\s+/g, '');

        // --- Data Extraction Logic (Mirrors app.js) ---
        
        let cityRaw = getCell('city') || getCell('cityAlt');
        if (cityRaw && cityRaw.includes(';')) cityRaw = cityRaw.replace(/;\s*/g, ', ');
        
        let state = null;
        if (hasData(cityRaw)) {
            const parts = cityRaw.split(/,?\s+/);
            let foundLocation = null;
            for (let j = parts.length; j > 0; j--) {
                const potentialLoc = parts.slice(j - 1, j).join(' ');
                const upperLoc = potentialLoc.toUpperCase();
                if (config.countryCodeMap[upperLoc]) { foundLocation = config.countryCodeMap[upperLoc]; break; }
                if (config.stateAbbreviationMap[upperLoc]) { foundLocation = config.stateAbbreviationMap[upperLoc]; break; }
                if (Object.values(config.stateAbbreviationMap).map(s => s.toUpperCase()).includes(upperLoc)) { foundLocation = Object.values(config.stateAbbreviationMap).find(s => s.toUpperCase() === upperLoc); break; }
            }
            state = foundLocation || parts[parts.length - 1].trim();
        }

        let eduHistory = [];
        if (isNew) {
            const unis = getCell('newEduUni').split('\n').filter(Boolean);
            const majorsRaw = getCell('newEduMajor').split('\n');
            const degreesRaw = getCell('newEduDegree').split('\n');
            const gradsRaw = getCell('newEduGradYear').split('\n');

            unis.forEach((uni, idx) => {
                const normUni = normalizeName(uni, config.universityNormalizationMap);
                if (normUni) {
                    const m = majorsRaw[idx] || '';
                    const d = degreesRaw[idx] || '';
                    eduHistory.push({
                        university: normUni,
                        majors: m ? m.split(/[\\/,|]+/).map(m => ({ original: m.trim(), normalized: normalizeName(m, config.majorNormalizationMap) })).filter(m => m.normalized) : [],
                        degrees: d ? d.split(/[\\/,|]+/).map(d => normalizeName(d, config.degreeNormalizationMap)).filter(Boolean) : [],
                        gradYear: gradsRaw[idx] || null
                    });
                }
            });
        } else {
            getCell('education').split('\n').forEach(entry => {
                const uniMatch = entry.match(/University:\s*(.+?)(?=,\s*Major\(s\):|$)/i);
                const majorMatch = entry.match(/Major\(s\):\s*(.+?)(?=,\s*Degree:|$)/i);
                const degreeMatch = entry.match(/Degree:\s*(.+?)(?=,\s*Graduation Year:|$)/i);
                const gradYearMatch = entry.match(/Graduation Year:\s*(\d{4})/i);
                const parsedUni = uniMatch ? uniMatch[1] : (entry.includes('University') || entry.includes('College') || !entry.includes(':') ? entry : null);
                const normUni = parsedUni ? normalizeName(parsedUni, config.universityNormalizationMap) : null;
                if (normUni) {
                    eduHistory.push({
                        university: normUni,
                        majors: majorMatch ? majorMatch[1].split(/[\\/,|]+/).map(m => ({ original: m.trim(), normalized: normalizeName(m, config.majorNormalizationMap) })).filter(m => m.normalized) : [],
                        degrees: degreeMatch ? degreeMatch[1].split(/[\\/,|]+/).map(d => normalizeName(d, config.degreeNormalizationMap)).filter(Boolean) : [],
                        gradYear: gradYearMatch ? gradYearMatch[1] : null
                    });
                }
            });
        }

        const socials = [];
        if (isNew) {
            const types = getCell('newSocialType').split('\n');
            const urls = getCell('newSocialUrl').split('\n');
            types.forEach((t, j) => {
                if (urls[j] && t) socials.push({ type: t.trim(), url: urls[j].trim(), display: urls[j].trim(), is_social: true });
            });
        } else {
            getCell('socialMedia').split('\n').forEach(line => {
                const typeMatch = line.match(/Type(?:\s\(.*?\))?:\s*([^,]+)/i);
                const handleMatch = line.match(/(?:Handle|URL):\s*(.*)/i);
                if(typeMatch && handleMatch) socials.push({ type: typeMatch[1].trim(), url: handleMatch[1].trim(), display: handleMatch[1].trim(), is_social: true });
            });
        }

        const websites = [];
        if (isNew) {
            const types = getCell('newWebsiteType').split('\n');
            const urls = getCell('newWebsiteUrl').split('\n');
            types.forEach((t, j) => {
                if (urls[j] && t) websites.push({ type: t.trim(), url: urls[j].trim(), display: urls[j].trim(), is_social: false });
            });
        } else {
            getCell('websites').split('\n').forEach(line => {
                const typeMatch = line.match(/Type(?:\s\(.*?\))?:\s*([^,]+)/i);
                const urlMatch = line.match(/URL:\s*(.*)/i);
                if (typeMatch && urlMatch) websites.push({ type: typeMatch[1].trim(), url: urlMatch[1].trim(), display: urlMatch[1].trim(), is_social: false });
            });
        }

        const record = {
            firstName, lastName, gradYear, email,
            phone: getCell('phone'),
            city: cityRaw, state,
            occupation: getCell('occupation'),
            industry: normalizeName(getCell('occupation'), config.normalizationIndustryMap || {}), // Fallback if not in category
            tenure: getCell('tenure'),
            favoriteStep: getCell('favoriteStep'),
            about: getCell('about'),
            photoUrl: getCell('photoUrl'),
            drbPhotoUrl: getCell('drbPhotoUrl'),
            militaryBranch: getCell('military') || getCell('rank'),
            militaryRank: getCell('rank'),
            educationHistory: eduHistory,
            socialMedia: socials,
            websites: websites,
            awards: getCell('awards').split(/[\n,]+/).map(p => p.trim()).filter(Boolean),
            leadership: getCell('leadership').split(/[\n,]+/).map(p => p.trim()).filter(Boolean)
        };
        
        // Industry normalization again
        if (record.occupation) {
            record.industry = normalizeName(record.occupation, config.occupationNormalizationMap);
        }

        map.set(uniqueKey, record);
    });
}

migrate();
