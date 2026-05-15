import Tesseract from 'tesseract.js';
import sharp from 'sharp';

export async function solveCaptchaImage(cookie) {
  const imgRes = await fetch('https://payments.billdesk.com/MercOnline/NumericCaptchaServlet', {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController'
    }
  });

  if (!imgRes.ok) throw new Error(`Image fetch failed`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const processedBuffer = await sharp(buffer)
    .greyscale()
    .normalize()
    .threshold(160)
    .toBuffer();

  const { data: { text } } = await Tesseract.recognize(
    processedBuffer,
    'eng',
    { 
      logger: m => {},
      tessedit_char_whitelist: '0123456789'
    }
  );

  return text.trim().slice(0, 6);
}