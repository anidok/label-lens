/**
 * Heuristic & Regex Parser for Packaged Food Nutrition Panels
 * Handles OCR outputs, common typo patterns, varied units, and "Salt vs Sodium" conversions.
 */

export function parseNutritionText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { error: 'Empty or invalid input text' };
  }

  const cleanText = rawText.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

  const parsed = {
    energy_kcal: null,
    total_fat_g: null,
    saturated_fat_g: null,
    trans_fat_g: null,
    carbohydrate_g: null,
    total_sugars_g: null,
    added_sugars_g: null,
    dietary_fibre_g: null,
    protein_g: null,
    sodium_mg: null,
    salt_g: null,
    serving_size: null,
    ingredients_text: ""
  };

  const parseNumber = (matchStr) => {
    if (!matchStr) return null;
    // Replace commas used as decimals, remove spaces, parse float
    const normalized = matchStr.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const val = parseFloat(normalized);
    return isNaN(val) ? null : val;
  };

  // 1. Energy (kcal or kJ)
  const energyKcalMatch = cleanText.match(/(?:energy|calories|caloric\s*value)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:kcal|calories)/i) ||
                          cleanText.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calories)/i) ||
                          cleanText.match(/(?:energy|calories)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
  if (energyKcalMatch) {
    parsed.energy_kcal = parseNumber(energyKcalMatch[1]);
  } else {
    // Check for kJ
    const kjMatch = cleanText.match(/(?:energy)?[^\d\n]*?(\d+(?:[.,]\d+)?)\s*kj\b/i);
    if (kjMatch) {
      const kj = parseNumber(kjMatch[1]);
      if (kj) parsed.energy_kcal = Math.round(kj / 4.184);
    }
  }

  // 2. Total Sugars & Added Sugars
  const addedSugarMatch = cleanText.match(/(?:added\s*sugars?|of\s*which\s*added\s*sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (addedSugarMatch) {
    parsed.added_sugars_g = parseNumber(addedSugarMatch[1]);
  }

  const totalSugarMatch = cleanText.match(/(?:total\s*sugars?|sugars?|of\s*which\s*sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (totalSugarMatch) {
    parsed.total_sugars_g = parseNumber(totalSugarMatch[1]);
  }

  // 3. Saturated Fat
  const satFatMatch = cleanText.match(/(?:saturated\s*(?:fatty\s*acids?|fat)|sat\s*fat)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (satFatMatch) {
    parsed.saturated_fat_g = parseNumber(satFatMatch[1]);
  }

  // 4. Trans Fat
  const transFatMatch = cleanText.match(/(?:trans\s*(?:fatty\s*acids?|fat))[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (transFatMatch) {
    parsed.trans_fat_g = parseNumber(transFatMatch[1]);
  }

  // 5. Total Fat
  const totalFatMatch = cleanText.match(/(?:total\s*fat|fat)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (totalFatMatch) {
    parsed.total_fat_g = parseNumber(totalFatMatch[1]);
  }

  // 6. Protein
  const proteinMatch = cleanText.match(/(?:protein)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (proteinMatch) {
    parsed.protein_g = parseNumber(proteinMatch[1]);
  }

  // 7. Carbohydrates
  const carbMatch = cleanText.match(/(?:carbohydrates?|total\s*carbohydrates?|carbs?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (carbMatch) {
    parsed.carbohydrate_g = parseNumber(carbMatch[1]);
  }

  // 8. Dietary Fibre
  const fibreMatch = cleanText.match(/(?:dietary\s*fib(?:re|er)|fib(?:re|er))[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (fibreMatch) {
    parsed.dietary_fibre_g = parseNumber(fibreMatch[1]);
  }

  // 9. Sodium & Salt
  const sodiumMatch = cleanText.match(/(?:sodium)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:mg|g)?/i);
  if (sodiumMatch) {
    let val = parseNumber(sodiumMatch[1]);
    // If unit is grams in text, convert to mg
    if (sodiumMatch[0].toLowerCase().includes('g') && !sodiumMatch[0].toLowerCase().includes('mg') && val < 50) {
      val = val * 1000;
    }
    parsed.sodium_mg = val;
  } else {
    // Check for Salt declaration (1g salt ~ 400mg sodium)
    const saltMatch = cleanText.match(/(?:salt|iodised\s*salt)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|mg)?/i);
    if (saltMatch) {
      let saltVal = parseNumber(saltMatch[1]);
      if (saltMatch[0].toLowerCase().includes('mg')) {
        saltVal = saltVal / 1000;
      }
      parsed.salt_g = saltVal;
      if (saltVal !== null) {
        parsed.sodium_mg = Math.round(saltVal * 400); // 40% sodium by weight
      }
    }
  }

  // 10. Serving size or Basis
  const servingMatch = cleanText.match(/(?:per\s*100\s*(?:g|ml)|serving\s*size[^\n]+|per\s*serve[^\n]*)/i);
  if (servingMatch) {
    parsed.serving_size = servingMatch[0].trim();
  } else {
    parsed.serving_size = "per 100g (Assumed standard basis)";
  }

  // 11. Ingredients list extraction
  const ingredientsMatch = cleanText.match(/(?:ingredients?|contains?:?)\s*[:\-]?\s*([\s\S]+?)(?:nutrition|nutritional|best\s*before|mfg|lic\.?\s*no|marketed\s*by|fssai|$)/i);
  if (ingredientsMatch) {
    parsed.ingredients_text = ingredientsMatch[1].replace(/\n+/g, ' ').trim();
  } else {
    // Check if the input looks like a pure ingredients list
    if (cleanText.toLowerCase().includes('flour') || cleanText.toLowerCase().includes('oil') || cleanText.toLowerCase().includes('sugar')) {
      parsed.ingredients_text = cleanText;
    }
  }

  return parsed;
}
