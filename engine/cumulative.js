import { evaluateFoodProduct } from './rules-engine.js';

/**
 * Computes cumulative / combined meal nutritional analysis across multiple food products
 * (e.g. Milk + Bread combo, or multiple snacks eaten in one sitting).
 * Evaluates the aggregated nutrient profile against FSSAI 2022 draft criteria.
 *
 * @param {Array<Object>} products - List of individual food products with nutrients and evaluation
 * @returns {Object} Cumulative analysis object including total nutrients, FSSAI rating, and combo insights
 */
export function computeCumulativeAnalysis(products) {
  if (!products || !Array.isArray(products) || products.length === 0) {
    return null;
  }

  // If single product, return single-item format
  if (products.length === 1) {
    const single = products[0];
    const nutrients = single.nutrients || single;
    const evaluation = single.evaluation || evaluateFoodProduct(nutrients);
    return {
      is_combo: false,
      product_count: 1,
      combo_title: single.product_name || 'Single Food Product',
      cumulative_nutrients: nutrients,
      evaluation,
      products: [{
        ...single,
        nutrients,
        evaluation
      }]
    };
  }

  // Multiple products: Aggregate total nutrients
  let totalEnergy = 0;
  let totalFat = 0;
  let totalSatFat = 0;
  let totalTransFat = 0;
  let totalCarbs = 0;
  let totalSugars = 0;
  let totalAddedSugars = 0;
  let totalFibre = 0;
  let totalProtein = 0;
  let totalSodium = 0;

  const combinedIngredients = [];
  const productNames = [];
  const processedProducts = [];

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    const nut = p.nutrients || p;
    const prodName = p.product_name || `Product ${idx + 1}`;
    productNames.push(prodName);

    totalEnergy += (parseFloat(nut.energy_kcal) || 0);
    totalFat += (parseFloat(nut.total_fat_g) || 0);
    totalSatFat += (parseFloat(nut.saturated_fat_g) || 0);
    totalTransFat += (parseFloat(nut.trans_fat_g) || 0);
    totalCarbs += (parseFloat(nut.carbohydrate_g) || 0);
    totalSugars += (parseFloat(nut.total_sugars_g) || 0);
    totalAddedSugars += (parseFloat(nut.added_sugars_g) || 0);
    totalFibre += (parseFloat(nut.dietary_fibre_g) || 0);
    totalProtein += (parseFloat(nut.protein_g) || 0);
    totalSodium += (parseFloat(nut.sodium_mg) || 0);

    if (nut.ingredients_text) {
      combinedIngredients.push(`[${prodName}]: ${nut.ingredients_text}`);
    }

    const evaluation = p.evaluation || evaluateFoodProduct(nut);
    processedProducts.push({
      id: p.id || `item-${idx + 1}`,
      product_name: prodName,
      brand: p.brand || 'Packaged Item',
      serving_size: nut.serving_size || 'per 100g/ml',
      nutrients: nut,
      evaluation
    });
  }

  // Atwater factor check if energy was missing or zero
  if (totalEnergy === 0 && (totalProtein > 0 || totalCarbs > 0 || totalFat > 0)) {
    totalEnergy = Math.round(totalProtein * 4 + totalCarbs * 4 + totalFat * 9);
  }

  const cumulativeNutrients = {
    energy_kcal: Math.round(totalEnergy * 10) / 10,
    total_fat_g: Math.round(totalFat * 10) / 10,
    saturated_fat_g: Math.round(totalSatFat * 10) / 10,
    trans_fat_g: Math.round(totalTransFat * 100) / 100,
    carbohydrate_g: Math.round(totalCarbs * 10) / 10,
    total_sugars_g: Math.round(totalSugars * 10) / 10,
    added_sugars_g: Math.round(totalAddedSugars * 10) / 10,
    dietary_fibre_g: Math.round(totalFibre * 10) / 10,
    protein_g: Math.round(totalProtein * 10) / 10,
    sodium_mg: Math.round(totalSodium * 10) / 10,
    serving_size: `Combined Meal (${products.length} items)`,
    ingredients_text: combinedIngredients.join('; ')
  };

  // Evaluate the entire combined meal against FSSAI guidelines
  const cumulativeEvaluation = evaluateFoodProduct(cumulativeNutrients);

  const comboTitle = productNames.join(' + ');

  // Compute Macro caloric contribution percentages
  const sugarCalories = cumulativeNutrients.total_sugars_g * 4;
  const satFatCalories = cumulativeNutrients.saturated_fat_g * 9;
  const sugarPct = totalEnergy > 0 ? ((sugarCalories / totalEnergy) * 100).toFixed(1) : 0;
  const satFatPct = totalEnergy > 0 ? ((satFatCalories / totalEnergy) * 100).toFixed(1) : 0;
  const sodiumDensity = totalEnergy > 0 ? (cumulativeNutrients.sodium_mg / totalEnergy).toFixed(2) : 0;

  return {
    is_combo: true,
    product_count: products.length,
    combo_title: comboTitle,
    cumulative_nutrients: cumulativeNutrients,
    evaluation: cumulativeEvaluation,
    products: processedProducts,
    combo_metrics: {
      total_calories: cumulativeNutrients.energy_kcal,
      sugar_calorie_pct: sugarPct,
      sat_fat_calorie_pct: satFatPct,
      sodium_density_mg_per_kcal: sodiumDensity,
      is_hfss: cumulativeEvaluation.hfss?.is_hfss || false,
      inr_stars: cumulativeEvaluation.inr?.inr_stars || 0
    }
  };
}
