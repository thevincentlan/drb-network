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

async function fetchCsvUrls() {
    console.log('Fetching CSV metadata from Apps Script API...');
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch(`${APPS_SCRIPT_URL}?action=admin_login&email=admin`);
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();
    
    const records1 = parse(data.csvOld, { columns: true, skip_empty_lines: true });
    let records2 = [];
    try { if (data.csvNew) records2 = parse(data.csvNew, { columns: true, skip_empty_lines: true }); } catch(e){}
    const records = [...records1, ...records2];
    
    const uniqueUrls = new Set();
    records.forEach(row => {
        const photoKey = Object.keys(row).find(k => k.toLowerCase().includes('photo for your profile'));
        const drbKey = Object.keys(row).find(k => k.toLowerCase().includes('photo of you on drb'));
        
        const photoMatch = photoKey && row[photoKey] ? row[photoKey].match(/https?:\/\/[^\s]+/) : null;
        const drbMatch = drbKey && row[drbKey] ? row[drbKey].match(/https?:\/\/[^\s]+/) : null;
        
        if (photoMatch) uniqueUrls.add(transformDriveUrl(photoMatch[0]));
        if (drbMatch) uniqueUrls.add(transformDriveUrl(drbMatch[0]));
    });

    return Array.from(uniqueUrls).filter(u => u && !IGNORE_URLS.some(i => u.includes('DRB%20Logo')));
}

async function run() {
    const urlsToScan = await fetchCsvUrls();
    console.log(`Found ${urlsToScan.length} unique photos to process.`);
    if (urlsToScan.length === 0) return;

    let existingData = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        try { existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); } catch(e) {}
    }

    // Filter out already processed urls
    const urls = urlsToScan.filter(u => !existingData[u]);
    console.log(`${urls.length} images remaining to scan.`);
    if (urls.length === 0) return;

    console.log('Launching Headless Chrome via Puppeteer...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Serve the face-api.min.js and models from local file system via a tiny Data URI HTML
    const modelsPath = path.resolve(__dirname, '../models');
    
    await page.goto('about:blank');
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js' });

    // Inject the runner logic into the page
    const results = await page.evaluate(async (imageUrls) => {
        // Since we cannot load models from file:// easily due to CORS in about:blank, 
        // we load it from the unpkg CDN for the script, but wait!
        // We can just load the models from the unpkg CDN too!
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
        
        const data = {};
        for(let i=0; i<imageUrls.length; i++){
            const url = imageUrls[i];
            try {
                const img = await new Promise((resolve, reject) => {
                    const imgEl = new Image();
                    imgEl.crossOrigin = 'anonymous';
                    imgEl.onload = () => resolve(imgEl);
                    imgEl.onerror = reject;
                    imgEl.src = url;
                });
                
                const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions());
                if (detection) {
                    const box = detection.box;
                    const centerX = box.x + (box.width / 2);
                    const centerY = box.y + (box.height / 2);
                    const xPercent = Math.max(0, Math.min(100, Math.round((centerX / img.width) * 100)));
                    const yPercent = Math.max(0, Math.min(100, Math.round((centerY / img.height) * 100)));
                    data[url] = { x: xPercent, y: yPercent };
                } else {
                    data[url] = { x: 50, y: 20 };
                }
            } catch(e) {
                data[url] = { x: 50, y: 20 };
            }
        }
        return data;
    }, urls);

    await browser.close();

    // Merge and save
    Object.assign(existingData, results);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingData, null, 2));
    console.log(`Scan complete! Saved to ${OUTPUT_FILE}`);
}

run().catch(console.error);
