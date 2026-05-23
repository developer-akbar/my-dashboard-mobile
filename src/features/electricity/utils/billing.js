/**
 * billing.js
 * 
 * Logic to estimate future APSPDCL bills based on unit consumption.
 */

export const DEFAULT_DOMESTIC_CONFIG = {
  id: 'domestic',
  label: 'Domestic',
  fixedChargesPerKW: 10,
  electricityDutyPct: 6,
  facPerUnit: 0, 
  slabs: [
    { min: 0,   max: 30,     rate: 1.9 },
    { min: 31,  max: 75,     rate: 3.00 },
    { min: 76,  max: 125,    rate: 4.50 },
    { min: 126, max: 225,    rate: 6.00 },
    { min: 226, max: 400,    rate: 8.75 },
    { min: 401, max: 999999, rate: 9.75 },
  ]
};

export const DEFAULT_COMMERCIAL_CONFIG = {
  id: 'commercial',
  label: 'Commercial',
  fixedChargesPerKW: 75, 
  electricityDutyPct: 6,
  facPerUnit: 0, 
  slabs: [
    { min: 0,   max: 50,     rate: 5.40 },
    { min: 51,  max: 100,    rate: 7.65 },
    { min: 101, max: 300,    rate: 9.05 },
    { min: 301, max: 500,    rate: 9.60 },
    { min: 501, max: 999999, rate: 9.95 },
  ]
};

/**
 * Calculates Energy Charges (EC) based on telescoping slabs.
 */
function calculateEC(units, slabs) {
  if (units <= 0 || !slabs || slabs.length === 0) return 0;
  
  let totalEC = 0;
  let remainingUnits = units;

  const sortedSlabs = [...slabs].sort((a, b) => a.min - b.min);

  let previousMax = 0;
  for (const slab of sortedSlabs) {
    const slabWidth = slab.max - previousMax;
    const unitsInSlab = Math.min(remainingUnits, slabWidth);
    
    totalEC += unitsInSlab * slab.rate;
    remainingUnits -= unitsInSlab;
    previousMax = slab.max;

    if (remainingUnits <= 0) break;
  }

  return totalEC;
}

/**
 * Estimates Customer Charges (CC) based on consumption units and type.
 */
function estimateCC(units, type = 'domestic') {
  if (type === 'commercial') {
    if (units <= 50) return 30;
    if (units <= 100) return 30;
    if (units <= 300) return 40;
    return 45;
  } else {
    // Domestic (LT1)
    if (units <= 50) return 25;
    if (units <= 75) return 30;
    if (units <= 125) return 45;
    if (units <= 225) return 50;
    return 55;
  }
}

/**
 * Calculate the estimated bill.
 */
export function calculateEstimatedBill(units, load = 0, config = DEFAULT_DOMESTIC_CONFIG) {
  const ec = calculateEC(units, config.slabs);
  const fc = Math.max(0, load) * (config.fixedChargesPerKW || 0);
  const ed = units * ((config.electricityDutyPct || 0) / 100);
  const cc = estimateCC(units, config.id);
  const fac = units * (config.facPerUnit || 0);
  
  const grossTotal = ec + fc + ed + cc + fac;
  
  return {
    units,
    ec: Math.round(ec * 100) / 100,
    fc: Math.round(fc * 100) / 100,
    ed: Math.round(ed * 100) / 100,
    cc: Math.round(cc * 100) / 100,
    fac: Math.round(fac * 100) / 100,
    total: Math.round(grossTotal),
  };
}
