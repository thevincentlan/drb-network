const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMh0iDxIrWzo6RsDDG3fZAA_MIWiz2ogijCmBAFWvbImzaLJePk59yJlQE-yjGL5KXRA/exec';
const OUTPUT_FILE = path.join(__dirname, '../data/face_coords.json');

// Known invalid URLs or placeholders that don't need face detection
const IGNORE_URLS = [
    'https://www.jotform.com/uploads/blueskyfun1/252616172364052/6341221063296455563/DRB%20Logo%20%28White%29.jpg'
];

function transformDriveUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let urlStr = url.trim();
    if (!urlStr) return null;
    const regex = /drive\.google\.com\/file\/d\/([^\/\?]+)/;
    const match = urlStr.match(regex);
    if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}=w1000`;
    }
    return urlStr;
}

function generateFaceKey(url) {
    if (!url) return null;
    let str = url.split('?')[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

async function fetchCsvUrls() {
    console.log('Fetching CSV metadata from Apps Script API...');
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch(`${APPS_SCRIPT_URL}?action=admin_login&email=admin`);
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();
    
    // Exact logic from app.js to generate the same IDs
    let records1 = [];
    try { if (data.csvOld) records1 = parse(data.csvOld, { skip_empty_lines: true }); } catch(e){}
    let records2 = [];
    try { if (data.csvNew) records2 = parse(data.csvNew, { skip_empty_lines: true }); } catch(e){}
    
    const headersOld = records1.length > 0 ? records1.shift() : [];
    const headersNew = records2.length > 0 ? records2.shift() : [];
    
    const mapRowToObj = (row, headers) => {
        const obj = {};
        for(let i=0; i<headers.length; i++){
            obj[headers[i]] = row[i];
        }
        return obj;
    };
    
    const allRecords = [
        ...records1.map(r => mapRowToObj(r, headersOld)),
        ...records2.map(r => mapRowToObj(r, headersNew))
    ];

    const jobs = [];
    
    allRecords.forEach((row, index) => {
        const id = String(index);
        
        const photoKey = Object.keys(row).find(k => k && k.toLowerCase().includes('photo for your profile'));
        const drbKey = Object.keys(row).find(k => k && k.toLowerCase().includes('photo of you on drb'));
        
        const photoMatch = photoKey && row[photoKey] ? String(row[photoKey]).match(/https?:\/\/[^\s]+/) : null;
        const drbMatch = drbKey && row[drbKey] ? String(row[drbKey]).match(/https?:\/\/[^\s]+/) : null;
        
        let mainUrl = photoMatch ? transformDriveUrl(photoMatch[0]) : null;
        let drbUrl = drbMatch ? transformDriveUrl(drbMatch[0]) : null;
        
        if (mainUrl && !IGNORE_URLS.some(i => mainUrl.includes('DRB%20Logo'))) {
            jobs.push({ id: generateFaceKey(mainUrl), url: mainUrl });
        }
        if (drbUrl && !IGNORE_URLS.some(i => drbUrl.includes('DRB%20Logo'))) {
            jobs.push({ id: generateFaceKey(drbUrl), url: drbUrl });
        }
    });

    return jobs;
}

async function run() {
    const jobsToScan = await fetchCsvUrls();
    console.log(`Found ${jobsToScan.length} unique photos to process.`);
    if (jobsToScan.length === 0) return;

    // Overwrite the entire file since row IDs might change if CSV is resorted
    let existingData = {};

    console.log('Launching Headless Chrome via Puppeteer...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Serve the face-api.min.js and models from local file system via a tiny Data URI HTML
    const modelsPath = path.resolve(__dirname, '../models');
    
    await page.goto('about:blank');
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js' });

    // Inject the runner logic into the page
    const results = await page.evaluate(async (jobs) => {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
        
        const data = {};
        for(let i=0; i<jobs.length; i++){
            const { id, url } = jobs[i];
            try {
                const img = await new Promise((resolve, reject) => {
                    const imgEl = new Image();
                    imgEl.crossOrigin = 'anonymous';
                    imgEl.onload = () => resolve(imgEl);
                    imgEl.onerror = reject;
                    imgEl.src = url;
                });
                
                const detection = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options());
                if (detection) {
                    const box = detection.box;
                    const centerX = box.x + (box.width / 2);
                    const centerY = box.y + (box.height / 2);
                    const xPercent = Math.max(0, Math.min(100, Math.round((centerX / img.width) * 100)));
                    const yPercent = Math.max(0, Math.min(100, Math.round((centerY / img.height) * 100)));
                    data[id] = { x: xPercent, y: yPercent };
                } else {
                    data[id] = { x: 50, y: 20 };
                }
            } catch(e) {
                data[id] = { x: 50, y: 20 };
            }
        }
        return data;
    }, jobsToScan);

    await browser.close();

    // Overwrite existing data because if rows moved, IDs shifted.
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Scan complete! Saved to ${OUTPUT_FILE}`);
}

run().catch(console.error);
