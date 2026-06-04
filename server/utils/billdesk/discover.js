/**
 * discover.js
 * 
 * Logic to automate the discovery of the bill generation time (HHMM) 
 * required for valid APSPDCL UPI VPAs.
 */

const RAZORPAY_VALIDATION_URL = 'https://api.razorpay.com/v1/payments/validate/vpa';

// Public/Test keys for VPA validation. 
// Ideally, the user should provide their own RAZORPAY_KEY_ID in .env
const VALIDATION_KEYS = [
  'rzp_test_1DP5mmOlF5G5ag', // Public test key
  'rzp_live_ILUunNf966099a'  // Example public live key
];

/**
 * Validates a UPI VPA using Razorpay's API.
 * This checks if the VPA is "payable" and registered with NPCI.
 */
export async function validateVPA(vpa, customKey = null) {
  const keys = customKey ? [customKey] : VALIDATION_KEYS;
  
  for (const key of keys) {
    try {
      const res = await fetch(RAZORPAY_VALIDATION_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(key + ':'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vpa })
      });
      
      if (res.ok) {
        const data = await res.json();
        // data.success will be true if VPA is valid
        return { ok: true, success: data.success, customerName: data.customer_name };
      }
    } catch (err) {
      console.error(`[vpa] Validation error with key ${key}:`, err.message);
    }
  }
  return { ok: false, error: 'All validation keys failed' };
}

/**
 * Generates the prioritized sequence of 24-hour minutes (HHMM)
 * based on user's field worker visitation pattern.
 */
export function getPrioritizedTimeSequence() {
  const blocks = [
    [8, 0, 10, 0],   // 0800 to 1000 (Morning)
    [10, 1, 12, 0],  // 1001 to 1200 (Late Morning)
    [12, 1, 14, 0],  // 1201 to 1400 (Early Afternoon)
    [16, 1, 18, 0],  // 1601 to 1800 (Late Afternoon)
    [18, 1, 20, 0],  // 1801 to 2000 (Evening)
    [14, 1, 16, 0],  // 1401 to 1600 (Mid-Afternoon)
  ];

  const sequence = [];
  const seen = new Set();

  const addRange = (h1, m1, h2, m2) => {
    let start = h1 * 60 + m1;
    let end = h2 * 60 + m2;
    for (let i = start; i <= end; i++) {
      if (!seen.has(i)) {
        sequence.push(i);
        seen.add(i);
      }
    }
  };

  blocks.forEach(b => addRange(...b));

  // Add the remaining minutes of the day (00:00 to 23:59)
  for (let i = 0; i < 1440; i++) {
    if (!seen.has(i)) {
      sequence.push(i);
      seen.add(i);
    }
  }

  return sequence.map(m => {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}${mm}`;
  });
}

/**
 * Formats a Date object as YYMMDD for the VPA string.
 */
export function formatVpaDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}
