const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto('file://' + __dirname + '/index.html');
    await new Promise(r => setTimeout(r, 2000));
    
    // Attempt Admin login dynamically
    await page.evaluate(() => {
        const input = document.getElementById('login-email');
        const btn = document.getElementById('login-btn');
        if (input && btn) {
            input.value = 'DRB#Network2024!Admin';
            btn.click();
        }
    });
    await new Promise(r => setTimeout(r, 4000));
    await browser.close();
})();
