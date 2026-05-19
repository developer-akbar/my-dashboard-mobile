/**
 * billing.js
 * 
 * Logic to estimate future APSPDCL bills based on unit consumption.
 */

const DOMESTIC_SLABS = [
  { limit: 30,  rate: 2.19 },
  { limit: 75,  rate: 3.27 },
  { limit: 125, rate: 4.58 },
  { limit: 225, rate: 6.00 },
  { limit: 400, rate: 8.75 },
  { limit: Infinity, rate: 9.75 },
];

/**
 * Calculates Energy Charges (EC) based on telescoping slabs for Domestic (LT1).
 */
function calculateDomesticEC(units) {
  if (units <= 0) return 0;
  
  let totalEC = 0;
  let remainingUnits = units;
  let previousLimit = 0;

  for (const slab of DOMESTIC_SLABS) {
    const slabWidth = slab.limit - previousLimit;
    const unitsInSlab = Math.min(remainingUnits, slabWidth);
    
    totalEC += unitsInSlab * slab.rate;
    remainingUnits -= unitsInSlab;
    previousLimit = slab.limit;

    if (remainingUnits <= 0) break;
  }

  return totalEC;
}

/**
 * Estimates Customer Charges (CC) based on consumption units.
 */
function estimateCC(units) {
  if (units <= 50) return 25;
  if (units <= 100) return 30;
  if (units <= 200) return 35;
  return 55;
}

/**
 * Calculate the estimated bill for Domestic (LT1).
 * 
 * @param {number} units Total units consumed
 * @param {number} load Connected load in kW
 * @returns {object} Breakup of the estimated bill
 */
export function calculateEstimatedBill(units, load = 0) {
  const ec = calculateDomesticEC(units);
  const fc = Math.max(0, load) * 10;
  const ed = units * 0.06;
  const cc = estimateCC(units);
  
  // Note: FSA (Fuel Surcharge Adjustment) is excluded as per user request.
  
  const grossTotal = ec + fc + ed + cc;
  
  return {
    units,
    ec: Math.round(ec * 100) / 100,
    fc: Math.round(fc * 100) / 100,
    ed: Math.round(ed * 100) / 100,
    cc: Math.round(cc * 100) / 100,
    total: Math.round(grossTotal),
  };
}
