import { scrapeBillDeskSession } from './server/utils/billdesk/session.js';
import { solveCaptchaImage } from './server/utils/billdesk/ocr.js';
import fetch from 'node-fetch';

async function test() {
  const serviceNumber = "2323335003064";
  const BILLDESK_URL = 'https://payments.billdesk.com/MercOnline/SPDCLController';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const session = await scrapeBillDeskSession('');
      console.log(`[Attempt ${attempt}] Scraped session:`, session);
      
      const captchaText = await solveCaptchaImage(session.cookie);
      console.log(`[Attempt ${attempt}] OCR Captcha:`, captchaText);
      
      if (!captchaText || captchaText.length < 5) continue;

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://payments.billdesk.com',
        'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': session.cookie
      };

      const body = new URLSearchParams({
        reqid: 'confirm',
        reqtoken: session.reqtoken || '',
        txtCustomerID: String(serviceNumber),
        jcaptchaVal: captchaText || '',
      }).toString();

      const res = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
      const html = await res.text();
      const htmlLower = html.toLowerCase();
      
      if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
         console.log(`[Attempt ${attempt}] Wrong Captcha response!`);
         continue;
      }
      
      console.log(`[Attempt ${attempt}] SUCCESS! HTML length:`, html.length);
      console.log(html.slice(0, 300));
      return;
    } catch (err) {
      console.error(`[Attempt ${attempt}] Error:`, err);
    }
  }
  console.log('Failed all 3 attempts');
}

test();
