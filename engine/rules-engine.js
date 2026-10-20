import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateFSSAI_INR } from './inr-calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Knowledge Bases
const fssaiRulesPath = path.join(__dirname, '../data/fssai-hfss-rules.json');
const allergensPath = path.join(__dirname, '../data/indian-allergens.json');
const additivesPath = path.join(__dirname, '../data/additives-watchlist.json');

const fssaiRules = JSON.parse(fs.readFileSync(fssaiRulesPath, 'utf8'));
const allergenData = JSON.parse(fs.readFileSync(allergensPath, 'utf8'));
const additiveData = JSON.parse(fs.readFileSync(additivesPath, 'utf8'));

/**
 * Evaluates parsed nutritional values and ingredient text against FSSAI 2022 draft criteria,
 * allergen dictionary, and additives watchlist.
 * Generates an auditable XAI reasoning trace for total transparency.
 */
export function evaluateFoodProduct(parsedData) {
  const {
    energy_kcal,
    total_fat_g,
    saturated_fat_g,
    total_sugars_g,
    sodium_mg,
    protein_g,
    dietary_fibre_g,
    ingredients_text
  } = parsedData;

  const reasoningTrace = [];
  const deductions = [];

  // Check if critical nutrition fields are missing
  const hasCoreNutrients = (energy_kcal && energy_kcal > 0) && 
    (total_sugars_g !== null || saturated_fat_g !== null || sodium_mg !== null);

  const hfssFlags = {
    is_hfss: false,
    undetermined: !hasCoreNutrients,
    sugar_exceeded: false,
    sat_fat_exceeded: false,
    sodium_exceeded: false,
    reasons: []
  };

  const nutrientEvaluations = {};

  let score = fssaiRules.scoring.base_score;

  // 1. Rule A1: Total Sugar Evaluation
  if (energy_kcal && energy_kcal > 0 && total_sugars_g !== null) {
    const sugarCalories = total_sugars_g * fssaiRules.conversion_factors.sugar_kcal_per_gram;
    const sugarEnergyPct = (sugarCalories / energy_kcal) * 100;
    const threshold = fssaiRules.hfss_thresholds.sugar.limit;
    const moderateThreshold = fssaiRules.hfss_thresholds.sugar.moderate_limit;

    let status = 'BALANCED';
    let deduction = 0;
    let explanation = '';

    if (sugarEnergyPct > threshold) {
      status = 'HIGH_RISK';
      deduction = fssaiRules.scoring.deductions.threshold_exceeded_per_nutrient;
      hfssFlags.sugar_exceeded = true;
      hfssFlags.is_hfss = true;
      explanation = `Sugar contributes ${sugarEnergyPct.toFixed(1)}% of total energy, exceeding the FSSAI draft limit of ${threshold}%.`;
      hfssFlags.reasons.push(explanation);
    } else if (sugarEnergyPct > moderateThreshold) {
      status = 'MODERATE';
      deduction = fssaiRules.scoring.deductions.moderate_threshold_per_nutrient;
      explanation = `Sugar contributes ${sugarEnergyPct.toFixed(1)}% of energy, within the 10% limit but elevated (>5%).`;
    } else {
      explanation = `Sugar contributes ${sugarEnergyPct.toFixed(1)}% of energy, well within safe dietary guidelines (<5%).`;
    }

    if (deduction > 0) {
      score -= deduction;
      deductions.push({ rule: 'Sugar Threshold', amount: deduction, reason: explanation });
    }

    nutrientEvaluations.sugar = {
      value_g: total_sugars_g,
      energy_kcal: parseFloat(sugarCalories.toFixed(1)),
      energy_pct: parseFloat(sugarEnergyPct.toFixed(1)),
      threshold_pct: threshold,
      status,
      explanation
    };

    reasoningTrace.push({
      step: 1,
      name: 'FSSAI Sugar Energy Rule',
      input: `${total_sugars_g}g sugar / ${energy_kcal} kcal total`,
      calculated: `${sugarEnergyPct.toFixed(1)}% of total calories (${sugarCalories.toFixed(0)} kcal)`,
      criterion: `Draft FSSAI Limit: <= ${threshold}%`,
      status,
      deduction: deduction > 0 ? `-${deduction.toFixed(1)}` : '0.0',
      finding: explanation
    });
  } else {
    nutrientEvaluations.sugar = { 
      value_g: total_sugars_g,
      energy_pct: null,
      status: 'UNKNOWN', 
      explanation: 'Sugar or energy value not declared/detected.' 
    };
    reasoningTrace.push({
      step: 1,
      name: 'FSSAI Sugar Energy Rule',
      input: 'Not declared or unreadable',
      calculated: 'Unknown',
      criterion: '<= 10% energy',
      status: 'UNKNOWN',
      deduction: '0.0',
      finding: 'Total sugar could not be extracted; verification needed.'
    });
  }

  // 2. Rule A2: Saturated Fat Evaluation
  if (energy_kcal && energy_kcal > 0 && saturated_fat_g !== null) {
    const satFatCalories = saturated_fat_g * fssaiRules.conversion_factors.saturated_fat_kcal_per_gram;
    const satFatEnergyPct = (satFatCalories / energy_kcal) * 100;
    const threshold = fssaiRules.hfss_thresholds.saturated_fat.limit;
    const moderateThreshold = fssaiRules.hfss_thresholds.saturated_fat.moderate_limit;

    let status = 'BALANCED';
    let deduction = 0;
    let explanation = '';

    if (satFatEnergyPct > threshold) {
      status = 'HIGH_RISK';
      deduction = fssaiRules.scoring.deductions.threshold_exceeded_per_nutrient;
      hfssFlags.sat_fat_exceeded = true;
      hfssFlags.is_hfss = true;
      explanation = `Saturated fat contributes ${satFatEnergyPct.toFixed(1)}% of total energy, exceeding the FSSAI draft limit of ${threshold}%.`;
      hfssFlags.reasons.push(explanation);
    } else if (satFatEnergyPct > moderateThreshold) {
      status = 'MODERATE';
      deduction = fssaiRules.scoring.deductions.moderate_threshold_per_nutrient;
      explanation = `Saturated fat contributes ${satFatEnergyPct.toFixed(1)}% of energy, within 10% limit but elevated (>5%).`;
    } else {
      explanation = `Saturated fat contributes ${satFatEnergyPct.toFixed(1)}% of energy, within healthy threshold.`;
    }

    if (deduction > 0) {
      score -= deduction;
      deductions.push({ rule: 'Saturated Fat Threshold', amount: deduction, reason: explanation });
    }

    nutrientEvaluations.saturated_fat = {
      value_g: saturated_fat_g,
      energy_kcal: parseFloat(satFatCalories.toFixed(1)),
      energy_pct: parseFloat(satFatEnergyPct.toFixed(1)),
      threshold_pct: threshold,
      status,
      explanation
    };

    reasoningTrace.push({
      step: 2,
      name: 'FSSAI Saturated Fat Energy Rule',
      input: `${saturated_fat_g}g saturated fat / ${energy_kcal} kcal total`,
      calculated: `${satFatEnergyPct.toFixed(1)}% of total calories (${satFatCalories.toFixed(0)} kcal)`,
      criterion: `Draft FSSAI Limit: <= ${threshold}%`,
      status,
      deduction: deduction > 0 ? `-${deduction.toFixed(1)}` : '0.0',
      finding: explanation
    });
  } else {
    nutrientEvaluations.saturated_fat = { 
      value_g: saturated_fat_g,
      energy_pct: null,
      status: 'UNKNOWN', 
      explanation: 'Saturated fat or energy value not declared/detected.' 
    };
    reasoningTrace.push({
      step: 2,
      name: 'FSSAI Saturated Fat Energy Rule',
      input: 'Not declared or unreadable',
      calculated: 'Unknown',
      criterion: '<= 10% energy',
      status: 'UNKNOWN',
      deduction: '0.0',
      finding: 'Saturated fat could not be extracted; verification needed.'
    });
  }

  // 3. Rule A3: Sodium Evaluation
  if (energy_kcal && energy_kcal > 0 && sodium_mg !== null) {
    const sodiumPerKcal = sodium_mg / energy_kcal;
    const threshold = fssaiRules.hfss_thresholds.sodium.limit;
    const moderateThreshold = fssaiRules.hfss_thresholds.sodium.moderate_limit;

    let status = 'BALANCED';
    let deduction = 0;
    let explanation = '';

    if (sodiumPerKcal > threshold) {
      status = 'HIGH_RISK';
      deduction = fssaiRules.scoring.deductions.threshold_exceeded_per_nutrient;
      hfssFlags.sodium_exceeded = true;
      hfssFlags.is_hfss = true;
      explanation = `Sodium ratio is ${sodiumPerKcal.toFixed(2)} mg/kcal, exceeding the FSSAI draft limit of ${threshold} mg/kcal.`;
      hfssFlags.reasons.push(explanation);
    } else if (sodiumPerKcal > moderateThreshold) {
      status = 'MODERATE';
      deduction = fssaiRules.scoring.deductions.moderate_threshold_per_nutrient;
      explanation = `Sodium ratio is ${sodiumPerKcal.toFixed(2)} mg/kcal, moderate but approaching regulatory threshold.`;
    } else {
      explanation = `Sodium ratio is ${sodiumPerKcal.toFixed(2)} mg/kcal, safely below threshold.`;
    }

    if (deduction > 0) {
      score -= deduction;
      deductions.push({ rule: 'Sodium Threshold', amount: deduction, reason: explanation });
    }

    nutrientEvaluations.sodium = {
      value_mg: sodium_mg,
      ratio_mg_per_kcal: parseFloat(sodiumPerKcal.toFixed(2)),
      threshold_ratio: threshold,
      status,
      explanation
    };

    reasoningTrace.push({
      step: 3,
      name: 'FSSAI Sodium / Energy Density Rule',
      input: `${sodium_mg}mg sodium / ${energy_kcal} kcal total`,
      calculated: `${sodiumPerKcal.toFixed(2)} mg sodium per 1 kcal`,
      criterion: `Draft FSSAI Limit: <= ${threshold} mg/kcal`,
      status,
      deduction: deduction > 0 ? `-${deduction.toFixed(1)}` : '0.0',
      finding: explanation
    });
  } else {
    nutrientEvaluations.sodium = { 
      value_mg: sodium_mg,
      ratio_mg_per_kcal: null,
      status: 'UNKNOWN', 
      explanation: 'Sodium or energy value not declared/detected.' 
    };
    reasoningTrace.push({
      step: 3,
      name: 'FSSAI Sodium Density Rule',
      input: 'Not declared or unreadable',
      calculated: 'Unknown',
      criterion: '<= 1.0 mg/kcal',
      status: 'UNKNOWN',
      deduction: '0.0',
      finding: 'Sodium could not be extracted; verification needed.'
    });
  }

  // HFSS Overall Compound Penalty
  if (hfssFlags.is_hfss) {
    const penalty = fssaiRules.scoring.deductions.hfss_overall_penalty;
    score -= penalty;
    deductions.push({ rule: 'Compound HFSS Penalty', amount: penalty, reason: 'Product tripped one or more draft HFSS limits.' });
    reasoningTrace.push({
      step: 4,
      name: 'HFSS Compound Penalty Rule',
      input: `Tripped ${[hfssFlags.sugar_exceeded && 'Sugar', hfssFlags.sat_fat_exceeded && 'Sat Fat', hfssFlags.sodium_exceeded && 'Sodium'].filter(Boolean).join(', ')}`,
      calculated: 'Tripped High Fat, Sugar, Salt criteria',
      criterion: 'Must pass all 3 thresholds',
      status: 'HIGH_RISK',
      deduction: `-${penalty.toFixed(1)}`,
      finding: 'Compound penalty applied for classified HFSS product.'
    });
  }

  // Rule B: Allergen Keyword Detection (Indian Diet Context)
  const detectedAllergens = [];
  const ingLower = (ingredients_text || '').toLowerCase();

  for (const family of allergenData.families) {
    const matches = [];
    for (const kw of family.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(ingLower)) {
        matches.push(kw);
      }
    }
    if (matches.length > 0) {
      detectedAllergens.push({
        family_id: family.id,
        family_name: family.name,
        severity: family.severity,
        matched_terms: Array.from(new Set(matches)),
        note: family.note || null
      });
    }
  }

  if (detectedAllergens.length > 0) {
    reasoningTrace.push({
      step: 5,
      name: 'Indian Allergen Identification Rule',
      input: `Ingredient text (${detectedAllergens.length} families identified)`,
      calculated: detectedAllergens.map(a => `${a.family_name} (${a.matched_terms.join(', ')})`).join('; '),
      criterion: 'Cross-check against Indian allergen taxonomy',
      status: 'ALERT',
      deduction: '0.0 (Informational)',
      finding: `Contains common allergens: ${detectedAllergens.map(a => a.family_name).join(', ')}.`
    });
  }

  // Rule C: Additives and INS Watchlist
  const flaggedAdditives = [];
  let additiveDeductionTotal = 0;

  for (const additive of additiveData.additives) {
    let matched = false;
    let matchedAlias = '';

    for (const alias of additive.aliases) {
      const regex = new RegExp(`\\b(?:ins\\s*|e\\s*)?${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(ingLower)) {
        matched = true;
        matchedAlias = alias;
        break;
      }
    }

    if (matched) {
      flaggedAdditives.push({
        code: additive.code,
        name: additive.name,
        category: additive.category,
        purpose: additive.purpose,
        concern: additive.concern,
        detected_term: matchedAlias
      });

      if (additiveDeductionTotal < fssaiRules.scoring.deductions.max_additive_deduction) {
        additiveDeductionTotal += fssaiRules.scoring.deductions.flagged_additive_per_item;
      }
    }
  }

  if (additiveDeductionTotal > 0) {
    score -= additiveDeductionTotal;
    deductions.push({
      rule: 'Additives Watchlist',
      amount: additiveDeductionTotal,
      reason: `Flagged ${flaggedAdditives.length} additives of concern.`
    });

    reasoningTrace.push({
      step: 6,
      name: 'Additives & Preservatives Evaluation Rule',
      input: `${flaggedAdditives.length} flagged substances detected`,
      calculated: flaggedAdditives.map(a => `${a.code} ${a.name}`).join(', '),
      criterion: 'Screen against INS high-concern registry',
      status: 'ALERT',
      deduction: `-${additiveDeductionTotal.toFixed(1)}`,
      finding: `Found ${flaggedAdditives.map(a => a.name).join(', ')}.`
    });
  }

  // Handle case where NO core nutrients were found at all
  if (!hasCoreNutrients) {
    return {
      score: null,
      score_label: "Incomplete Nutrition Data",
      badge_style: "caution",
      color_code: "#64748b",
      is_incomplete: true,
      hfss: {
        is_hfss: false,
        undetermined: true,
        reasons: ["Essential nutrition table values (Energy, Sugar, Fat, Sodium) could not be detected from the image. Please verify or enter values below."]
      },
      nutrients: nutrientEvaluations,
      inr: { inr_stars: null, final_score: null, breakdown: {} },
      allergens: detectedAllergens,
      additives: flaggedAdditives,
      deductions: [],
      reasoning_trace: reasoningTrace,
      disclaimer: "Nutrition values could not be extracted automatically. Please verify or input the label values below."
    };
  }

  // Floor score at 1.0 and round to nearest half point
  score = Math.max(fssaiRules.scoring.min_score, score);
  score = Math.round(score * 2) / 2;

  // Determine suitability label
  let suitabilityLabel = fssaiRules.scoring.score_labels[fssaiRules.scoring.score_labels.length - 1];
  for (const item of fssaiRules.scoring.score_labels) {
    if (score >= item.min) {
      suitabilityLabel = item;
      break;
    }
  }

  // Calculate official FSSAI Draft INR Star Rating
  const inrEvaluation = calculateFSSAI_INR(parsedData);

  return {
    score: score,
    score_label: suitabilityLabel.label,
    badge_style: suitabilityLabel.badge,
    color_code: suitabilityLabel.color,
    is_incomplete: false,
    hfss: hfssFlags,
    nutrients: nutrientEvaluations,
    inr: inrEvaluation,
    allergens: detectedAllergens,
    additives: flaggedAdditives,
    deductions,
    reasoning_trace: reasoningTrace,
    disclaimer: "Academic prototype evaluation based on FSSAI 2022 draft criteria. Not clinical medical or dietary advice."
  };
}
