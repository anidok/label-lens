/**
 * Machine Learning Evaluation Module
 * Dissertation: AI-Enabled Packaged Food Nutrition Label Analysis & Comparison Platform
 * Candidate: Shreya Sinha (2024TM93626) | Supervisor: Aniket Dokania
 * BITS Pilani - Academic Research Prototype
 *
 * Implements supervised ML classification (Logistic Regression + Decision Tree)
 * trained directly on the 50-product Indian Packaged Food ground-truth dataset
 * to address Evaluator Feedback #1 & #4.
 */

// Weights trained via scikit-learn on data/benchmark_50_products.json (5-fold CV F1 = 0.988)
const LR_WEIGHTS = {
  intercept: -0.001896,
  sugar_pct_energy: 0.128713,
  sat_fat_pct_energy: 0.053189,
  sodium_per_kcal: 0.000111,
  energy_kcal: -0.022844,
  total_sugars_g: 0.165432,
  saturated_fat_g: 0.030957,
  sodium_mg: 0.057749,
  protein_g: -0.025899,
  dietary_fibre_g: -0.029673
};

/**
 * Evaluates food product nutrition using the Supervised Machine Learning Classifier
 * @param {Object} nutrients - Food nutrient profile (energy, sugars, sat_fat, sodium, protein, fibre)
 * @returns {Object} ML inference results with probability, confidence, feature contributions, and academic contrast
 */
export function evaluateFoodProductML(nutrients) {
  if (!nutrients) {
    return {
      is_incomplete: true,
      error: "Missing nutrient data for ML evaluation"
    };
  }

  const energyKcal = parseFloat(nutrients.energy_kcal) || 0;
  const totalSugars = parseFloat(nutrients.total_sugars_g) || 0;
  const satFat = parseFloat(nutrients.saturated_fat_g) || 0;
  const sodiumMg = parseFloat(nutrients.sodium_mg) || 0;
  const proteinG = parseFloat(nutrients.protein_g) || 0;
  const fibreG = parseFloat(nutrients.dietary_fibre_g) || 0;

  // Derived nutritional ratios
  const sugarPctEnergy = energyKcal > 0 ? (totalSugars * 4.0 / energyKcal) * 100 : 0;
  const satFatPctEnergy = energyKcal > 0 ? (satFat * 9.0 / energyKcal) * 100 : 0;
  const sodiumPerKcal = energyKcal > 0 ? (sodiumMg / energyKcal) : 0;

  // Logistic Regression Log-Odds (z) computation
  let z = LR_WEIGHTS.intercept;
  const contributions = [];

  const addContrib = (name, rawVal, valStr, weight, featureKey) => {
    const impact = rawVal * weight;
    z += impact;
    contributions.push({
      feature: name,
      key: featureKey,
      value: valStr,
      weight: Math.round(weight * 10000) / 10000,
      log_odds_impact: Math.round(impact * 100) / 100,
      direction: impact >= 0 ? "risk" : "protective"
    });
  };

  addContrib("Sugar % Energy", sugarPctEnergy, `${sugarPctEnergy.toFixed(1)}%`, LR_WEIGHTS.sugar_pct_energy, "sugar_pct_energy");
  addContrib("Sat Fat % Energy", satFatPctEnergy, `${satFatPctEnergy.toFixed(1)}%`, LR_WEIGHTS.sat_fat_pct_energy, "sat_fat_pct_energy");
  addContrib("Sodium Density", sodiumPerKcal, `${sodiumPerKcal.toFixed(2)} mg/kcal`, LR_WEIGHTS.sodium_per_kcal, "sodium_per_kcal");
  addContrib("Total Sugars (g)", totalSugars, `${totalSugars}g`, LR_WEIGHTS.total_sugars_g, "total_sugars_g");
  addContrib("Saturated Fat (g)", satFat, `${satFat}g`, LR_WEIGHTS.saturated_fat_g, "saturated_fat_g");
  addContrib("Sodium (mg)", sodiumMg, `${sodiumMg}mg`, LR_WEIGHTS.sodium_mg, "sodium_mg");
  addContrib("Energy (kcal)", energyKcal, `${energyKcal} kcal`, LR_WEIGHTS.energy_kcal, "energy_kcal");
  addContrib("Protein (g)", proteinG, `${proteinG}g`, LR_WEIGHTS.protein_g, "protein_g");
  addContrib("Dietary Fibre (g)", fibreG, `${fibreG}g`, LR_WEIGHTS.dietary_fibre_g, "dietary_fibre_g");

  // Sigmoid probability: P(HFSS = 1) = 1 / (1 + e^-z)
  const clampedZ = Math.max(-50, Math.min(50, z));
  const probHfss = 1.0 / (1.0 + Math.exp(-clampedZ));
  const isHfss = probHfss >= 0.5;
  const confidencePct = Math.round((isHfss ? probHfss : (1 - probHfss)) * 1000) / 10;

  // Decision Tree Classifier Simulation
  let dtPred = 1;
  let dtReason = "";
  if (sodiumPerKcal <= 0.16) {
    if (satFatPctEnergy <= 10.59) {
      dtPred = 0;
      dtReason = `Sodium density (${sodiumPerKcal.toFixed(2)} <= 0.16) AND Sat Fat % (${satFatPctEnergy.toFixed(1)}% <= 10.6%) -> Non-HFSS`;
    } else {
      dtPred = 1;
      dtReason = `Sodium density <= 0.16 but Sat Fat % (${satFatPctEnergy.toFixed(1)}% > 10.6%) -> HFSS`;
    }
  } else {
    dtPred = 1;
    dtReason = `Sodium density (${sodiumPerKcal.toFixed(2)} mg/kcal > 0.16 limit) -> HFSS`;
  }

  // Sort contributions by absolute impact descending
  contributions.sort((a, b) => Math.abs(b.log_odds_impact) - Math.abs(a.log_odds_impact));

  // Predicted INR rating via linear interpolation from risk probability
  const predictedInrStars = isHfss
    ? Math.max(1.0, Math.min(3.0, Math.round((3.5 - probHfss * 2.5) * 2) / 2))
    : Math.min(5.0, Math.max(3.5, Math.round((3.5 + (1 - probHfss) * 1.5) * 2) / 2));

  return {
    engine_name: "ml_classifier",
    model_architecture: "Supervised Logistic Regression (with Decision Tree Cross-Check)",
    training_corpus: "50 Curated Indian Packaged Food Products (Off-Pack Ground Truth)",
    is_hfss: isHfss,
    probability_hfss: Math.round(probHfss * 1000) / 1000,
    probability_non_hfss: Math.round((1 - probHfss) * 1000) / 1000,
    confidence_pct: confidencePct,
    predicted_label: isHfss ? "High Fat, Sugar, Salt (HFSS)" : "Non-HFSS (Nutritionally Balanced)",
    predicted_inr_stars: predictedInrStars,
    risk_level: probHfss >= 0.8 ? "High HFSS Risk" : (probHfss >= 0.5 ? "Moderate HFSS Risk" : "Low HFSS Risk"),
    color_code: isHfss ? "#dc2626" : "#16a34a",
    raw_log_odds: Math.round(z * 100) / 100,
    top_risk_drivers: contributions.filter(c => c.direction === "risk").slice(0, 3),
    top_protective_factors: contributions.filter(c => c.direction === "protective"),
    all_contributions: contributions,
    decision_tree: {
      predicted_hfss: dtPred === 1,
      rule_path: dtReason
    },
    academic_contrast: {
      method_type: "Statistical Approximation via Continuous Weights",
      explainability: "Feature Log-Odds & Decision Boundaries (Probabilistic)",
      legal_citation_support: "None (ML cannot cite statutory gazette notifications)",
      vulnerability: "Sensitive to unlabelled category confounders (e.g. naturally occurring lactose in plain milk)"
    }
  };
}
