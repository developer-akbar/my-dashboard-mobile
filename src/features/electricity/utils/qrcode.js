/**
 * qrcode.js
 * 
 * Logic to dynamically generate APSPDCL UPI Payment Strings based on reverse engineering.
 */

/**
 * Generates the UPI payment string for a given service.
 * 
 * Target URL Structure (Reverse Engineered):
 * upi://pay?ver=01&mode=02&appid=com.apspdcl.ebs&tr=[TR]&mc=5411&pa=[PA]&pn=APSPDCL&tn=APSPDCL-Bill-Payment&am=[AM]&cu=INR&qrMedium=03
 */
export function generateAPSPDCLUpiString(service) {
  if (!service || !service.serviceNumber) return null;

  const sn = service.serviceNumber;
  // Use publicBillAmount (original bill) even if partially paid, fallback to current demand
  const rawAmount = service.publicBillAmount || service.billBreakup?.currentMonthBill || service.lastAmountDue || 0;
  const amount = Number(rawAmount).toFixed(2);
  const name = service.customerName || 'Consumer';

  // 1. Extract Date components (YYMMDD) for the VPA
  // billDate from server is ISO (e.g., 2026-05-02T10:15:00Z)
  const dateObj = service.lastBillDate ? new Date(service.lastBillDate) : new Date();
  const yy = String(dateObj.getUTCFullYear()).slice(-2);
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getUTCDate()).padStart(2, '0');
  const dateCode = `${yy}${mm}${dd}`;

  // 2. Resolve Time Code (HHMM)
  // The 'hard part' of the APSPDCL VPA: it requires the HHMM of bill generation.
  // We extract this from the raw API responses on the server using deep parsing.
  // If not found, we use '0000' as a stable daily fallback.
  const timeCode = service.billTime || '0000';

  // 3. PA logic (Payee Address): [SN].[YYMMDD][HHMM].[NAME]@indianbk
  // Clean name: first 10 alpha characters only, lowercase (as per official bill format)
  const cleanName = name.replace(/[^a-zA-Z]/g, '').toLowerCase().substring(0, 10);
  const pa = `${sn}.${dateCode}${timeCode}.${cleanName}@indianbk`;

  // 4. TR logic (Transaction Reference): [PREFIX]5002[MMYY][HHMM][RANDOM_PADDING]
  // Matching the pattern found in physical bill QRs: 232 5002 0526 1015 09 1526
  const prefix = sn.substring(0, 3);
  const mmyy = `${mm}${yy}`;
  const randomSS = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const randomHHMM = String(Math.floor(1000 + Math.random() * 8999));
  const tr = `${prefix}5002${mmyy}${timeCode}${randomSS}${randomHHMM}`.substring(0, 21);

  // 5. Build final URI manually to avoid URLSearchParams encoding '@' into '%40'
  // Most UPI apps require a literal '@' in the VPA address for merchant verification.
  const upiUrl = `upi://pay?ver=01&mode=02&appid=com.apspdcl.ebs&tr=${tr}&mc=5411&pa=${pa}&pn=APSPDCL&tn=APSPDCL-Bill-Payment&am=${amount}&cu=INR&qrMedium=03`;

  return upiUrl;
}
