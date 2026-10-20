/**
 * Official FSSAI Draft 2022 Indian Nutrition Rating (INR) Calculator
 * Based on FSSAI Draft Labelling and Display Amendment Regulations, Schedule V
 * Evaluates Solid Packaged Foods per 100g:
 * Baseline Points (Negative: Energy, Sugars, Sat Fat, Sodium) minus Modifying Points (Positive: Fibre, Protein).
 */

export function calculateFSSAI_INR(nutrients = {}) {
  const energyKcal = nutrients.energy_kcal || 0;
  const sugarG = nutrients.total_sugars_g || 0;
  const satFatG = nutrients.saturated_fat_g || 0;
  const sodiumMg = nutrients.sodium_mg || 0;
  const fibreG = nutrients.dietary_fibre_g || 0;
  const proteinG = nutrients.protein_g || 0;

  // 1. Negative Points: Energy (converted to kJ: 1 kcal = 4.184 kJ)
  const energyKj = energyKcal * 4.184;
  let energyPoints = 0;
  if (energyKj > 3350) energyPoints = 10;
  else if (energyKj > 3015) energyPoints = 9;
  else if (energyKj > 2680) energyPoints = 8;
  else if (energyKj > 2345) energyPoints = 7;
  else if (energyKj > 2010) energyPoints = 6;
  else if (energyKj > 1675) energyPoints = 5;
  else if (energyKj > 1340) energyPoints = 4;
  else if (energyKj > 1005) energyPoints = 3;
  else if (energyKj > 670) energyPoints = 2;
  else if (energyKj > 335) energyPoints = 1;

  // 2. Negative Points: Total Sugars (g / 100g)
  let sugarPoints = 0;
  if (sugarG > 45.0) sugarPoints = 10;
  else if (sugarG > 40.0) sugarPoints = 9;
  else if (sugarG > 36.0) sugarPoints = 8;
  else if (sugarG > 31.0) sugarPoints = 7;
  else if (sugarG > 27.0) sugarPoints = 6;
  else if (sugarG > 22.5) sugarPoints = 5;
  else if (sugarG > 18.0) sugarPoints = 4;
  else if (sugarG > 13.5) sugarPoints = 3;
  else if (sugarG > 9.0) sugarPoints = 2;
  else if (sugarG > 4.5) sugarPoints = 1;

  // 3. Negative Points: Saturated Fat (g / 100g)
  let satFatPoints = 0;
  if (satFatG > 10.0) satFatPoints = 10;
  else if (satFatG > 9.0) satFatPoints = 9;
  else if (satFatG > 8.0) satFatPoints = 8;
  else if (satFatG > 7.0) satFatPoints = 7;
  else if (satFatG > 6.0) satFatPoints = 6;
  else if (satFatG > 5.0) satFatPoints = 5;
  else if (satFatG > 4.0) satFatPoints = 4;
  else if (satFatG > 3.0) satFatPoints = 3;
  else if (satFatG > 2.0) satFatPoints = 2;
  else if (satFatG > 1.0) satFatPoints = 1;

  // 4. Negative Points: Sodium (mg / 100g)
  let sodiumPoints = 0;
  if (sodiumMg > 900) sodiumPoints = 10;
  else if (sodiumMg > 810) sodiumPoints = 9;
  else if (sodiumMg > 720) sodiumPoints = 8;
  else if (sodiumMg > 630) sodiumPoints = 7;
  else if (sodiumMg > 540) sodiumPoints = 6;
  else if (sodiumMg > 450) sodiumPoints = 5;
  else if (sodiumMg > 360) sodiumPoints = 4;
  else if (sodiumMg > 270) sodiumPoints = 3;
  else if (sodiumMg > 180) sodiumPoints = 2;
  else if (sodiumMg > 90) sodiumPoints = 1;

  const baselineNegativePoints = energyPoints + sugarPoints + satFatPoints + sodiumPoints;

  // 5. Positive Points: Dietary Fibre (g / 100g)
  let fibrePoints = 0;
  if (fibreG > 3.7) fibrePoints = 5;
  else if (fibreG > 2.8) fibrePoints = 4;
  else if (fibreG > 1.9) fibrePoints = 3;
  else if (fibreG > 1.1) fibrePoints = 2;
  else if (fibreG > 0.4) fibrePoints = 1;

  // 6. Positive Points: Protein (g / 100g)
  let proteinPoints = 0;
  if (proteinG > 8.0) proteinPoints = 5;
  else if (proteinG > 6.4) proteinPoints = 4;
  else if (proteinG > 4.8) proteinPoints = 3;
  else if (proteinG > 3.2) proteinPoints = 2;
  else if (proteinG > 1.6) proteinPoints = 1;

  const positiveModifyingPoints = fibrePoints + proteinPoints;

  // Final INR Score
  const finalINRScore = baselineNegativePoints - positiveModifyingPoints;

  // Map to Star Rating (0.5 to 5.0 stars)
  let stars = 0.5;
  if (finalINRScore <= -1) stars = 5.0;
  else if (finalINRScore <= 2) stars = 4.5;
  else if (finalINRScore <= 6) stars = 4.0;
  else if (finalINRScore <= 10) stars = 3.5;
  else if (finalINRScore <= 14) stars = 3.0;
  else if (finalINRScore <= 18) stars = 2.5;
  else if (finalINRScore <= 22) stars = 2.0;
  else if (finalINRScore <= 26) stars = 1.5;
  else if (finalINRScore <= 30) stars = 1.0;
  else stars = 0.5;

  return {
    inr_stars: stars,
    final_score: finalINRScore,
    breakdown: {
      energy_points: energyPoints,
      sugar_points: sugarPoints,
      sat_fat_points: satFatPoints,
      sodium_points: sodiumPoints,
      total_negative_points: baselineNegativePoints,
      fibre_points: fibrePoints,
      protein_points: proteinPoints,
      total_positive_points: positiveModifyingPoints
    },
    reference: "FSSAI Draft Notification 2022 (Schedule V Indian Nutrition Rating)"
  };
}
