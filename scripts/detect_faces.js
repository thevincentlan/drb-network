const faceapi = require('@vladmandic/face-api');
const { Canvas, Image, ImageData } = require('canvas');
const fs = require('fs');
const fetch = require('node-fetch');
const { parse } = require('csv-parse/sync');

// Patch face-api for node js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMh0iDxIrWzo6RsDDG3fZAA_MIWiz2ogijCmBAFWvbImzaLJePk59yJlQE-yjGL5KXRA/exec';

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
        return `https://lh3.googleusercontent.com/d/${match[1]}=w1000`; // Fetch image content, not HTML page
    }
    return urlStr;
}

async function run() {
    console.log('Loading face detection model...');
    await faceapi.nets.tinyFaceDetector.loadFromDisk('./models');
    
    console.log('Fetching CSV from Apps Script...');
    const resp = await fetch(`${APPS_SCRIPT_URL}?action=admin_login&email=admin`);
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();
    
    console.log('Parsing CSV...');
    const records1 = parse(data.csvOld, { columns: true, skip_empty_lines: true });
    let records2 = [];
    try { if (data.csvNew) records2 = parse(data.csvNew, { columns: true, skip_empty_lines: true }); } catch(e){}
    const records = [...records1, ...records2];
    
    // Collect all unique image URLs to process
    const uniqueUrls = new Set();
    records.forEach(row => {
        const photoKey = Object.keys(row).find(k => k.toLowerCase().includes('photo for your profile'));
        const drbKey = Object.keys(row).find(k => k.toLowerCase().includes('photo of you on drb'));
        
        const photoMatch = photoKey && row[photoKey] ? row[photoKey].match(/https?:\/\/[^\s]+/) : null;
        const drbMatch = drbKey && row[drbKey] ? row[drbKey].match(/https?:\/\/[^\s]+/) : null;
        
        if (photoMatch) uniqueUrls.add(transformDriveUrl(photoMatch[0]));
        if (drbMatch) uniqueUrls.add(transformDriveUrl(drbMatch[0]));
    });

    const urls = Array.from(uniqueUrls).filter(u => u && !IGNORE_URLS.includes(u));
    console.log(`Found ${urls.length} unique photos to process.`);

    const faceData = {};
    const faceDataPath = './data/face_coords.json';
    
    // Load existing data if there
    if (fs.existsSync(faceDataPath)) {
        try { Object.assign(faceData, JSON.parse(fs.readFileSync(faceDataPath, 'utf8'))); } catch(e){}
    }

    let processed = 0, found = 0, failed = 0;

    for (const url of urls) {
        processed++;
        if (faceData[url]) {
            console.log(`[${processed}/${urls.length}] Skipped (already cached): ${url}`);
            continue;
        }

        try {
            console.log(`[${processed}/${urls.length}] Processing: ${url}`);
            const imgResp = await fetch(url, { headers: { 'User-Agent': 'Node' } });
            if (!imgResp.ok) throw new Error('Failed to fetch image: ' + imgResp.status);
            
            const buffer = await imgResp.buffer();
            const img = new Image();
            img.src = buffer;
            
            // Wait for image load (canvas Image is sync but good practice)
            const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions());
            
            if (detections) {
                const box = detections.box;
                const imgWidth = img.width;
                const imgHeight = img.height;
                
                // Calculate center of face in percentages
                const centerX = (box.x + (box.width / 2));
                const centerY = (box.y + (box.height / 2));
                
                const xPercent = Math.max(0, Math.min(100, Math.round((centerX / imgWidth) * 100)));
                const yPercent = Math.max(0, Math.min(100, Math.round((centerY / imgHeight) * 100)));
                
                faceData[url] = { x: xPercent, y: yPercent };
                found++;
                console.log(`  -> Face found at ${xPercent}% ${yPercent}%`);
            } else {
                console.log(`  -> No face detected. Using fallback top-center.`);
                // Record the failure to avoid re-processing, fallback is handled naturally by CSS or object code
                faceData[url] = { x: 50, y: 20 }; // Fallback to near top center
            }
        } catch (e) {
            console.warn(`  -> Error processing image: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nFinished: Processed ${processed}, Found faces in ${found}, Errors in ${failed}`);
    fs.writeFileSync(faceDataPath, JSON.stringify(faceData, null, 2));
    console.log(`Saved face coordinates to ${faceDataPath}`);
}

run().catch(console.error);
