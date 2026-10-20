/**
 * Robust Heuristic & Multi-Column Parser for Packaged Food Nutrition Panels
 * Handles OCR outputs, common typo patterns, varied units, multi-column tables,
 * and "Salt vs Sodium" conversions.
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
    ingredients_text: "",
    extraction_notes: []
  };

  const parseNumber = (matchStr) => {
    if (!matchStr) return null;
    let norm = matchStr.replace(/[lIi]/g, '1').replace(/[oO]/g, '0');
    // If OCR misread 'g' as '9' after a decimal, e.g. '1.59' -> '1.5'
    if (/\d+\.\d+9$/.test(norm.trim())) {
      norm = norm.trim().slice(0, -1);
    }
    norm = norm.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const val = parseFloat(norm);
    return isNaN(val) ? null : val;
  };

  // Helper to normalize faint decimal points (e.g. 97g fat in a single serve -> 9.7g, 358g sugar -> 3.58g)
  const sanitizeGrams = (val, maxPlausible = 50) => {
    if (val === null) return null;
    if (val > maxPlausible && val < 100) {
      return parseFloat((val / 10).toFixed(1)); // 97 -> 9.7
    }
    if (val >= 100 && val < 1000) {
      return parseFloat((val / 100).toFixed(2)); // 358 -> 3.58
    }
    return val;
  };

  // 1. Energy (kcal or kJ or Calories)
  for (const line of lines) {
    if (/(?:calories|energy|caloric\s*value)/i.test(line) && !/from\s*fat/i.test(line)) {
      const match = line.match(/(?:energy\s*kcal|calories|energy)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:kcal)?/i);
      if (match) {
        const val = parseNumber(match[1]);
        if (val && val >= 20 && val <= 1000) {
          parsed.energy_kcal = val;
          break;
        }
      }
    }
  }

  // Fallback for Calories
  if (parsed.energy_kcal === null) {
    const calMatch = cleanText.match(/(?:calories|energy)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
    if (calMatch) {
      const val = parseNumber(calMatch[1]);
      if (val && val >= 20 && val <= 1000) parsed.energy_kcal = val;
    }
  }

  // 2. Total Fat
  for (const line of lines) {
    if (/total\s*fa[it]|total\s*lipid/i.test(line) && !/saturated/i.test(line)) {
      const match = line.match(/total\s*fa[it][^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 60);
        parsed.total_fat_g = val;
        break;
      }
    }
  }

  // 3. Saturated Fat (including Indian acronym SAFA, S4FA, S4k4)
  for (const line of lines) {
    if (/satura[tl]ed\s*fa[it]|sat\s*fa[it]|saturates|\bsafa\b|\bs4fa\b|\bs4k4\b/i.test(line)) {
      const match = line.match(/(?:satura[tl]ed\s*fa[it]|sat\s*fa[it]|safa|s4fa|s4k4)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|9)?/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 40);
        parsed.saturated_fat_g = val;
        break;
      }
    }
  }

  // 4. Total Sugars
  for (const line of lines) {
    if (/total\s*sugars?|sugars?/i.test(line) && !/added/i.test(line)) {
      const isLessThan = /less\s*than|</i.test(line);
      const match = line.match(/(?:total\s*sugars?|sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 70);
        parsed.total_sugars_g = isLessThan ? 0.5 : val;
        break;
      }
    }
  }

  // Added Sugars
  const addedSugarMatch = cleanText.match(/(?:added\s*sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|gm)?/i);
  if (addedSugarMatch) parsed.added_sugars_g = parseNumber(addedSugarMatch[1]);

  // 5. Sodium & Salt
  for (const line of lines) {
    if (/sodium/i.test(line)) {
      const match = line.match(/sodium[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:mg)?/i);
      if (match) {
        let val = parseNumber(match[1]);
        if (val !== null) {
          // If < 10 and no mg specified, might be grams
          if (val < 10 && !line.includes('mg')) val = val * 1000;
          parsed.sodium_mg = val;
          break;
        }
      }
    }
  }

  // Check for Salt
  if (parsed.sodium_mg === null) {
    const saltMatch = cleanText.match(/(?:salt|iodised\s*salt)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|mg|%)?/i);
    if (saltMatch) {
      let saltVal = parseNumber(saltMatch[1]);
      if (saltVal !== null) {
        if (saltMatch[0].toLowerCase().includes('mg')) saltVal = saltVal / 1000;
        parsed.salt_g = saltVal;
        parsed.sodium_mg = Math.round(saltVal * 400); // 40% sodium in salt
      }
    }
  }

  // 6. Protein
  for (const line of lines) {
    if (/protein/i.test(line) && !/blend|isolate/i.test(line)) {
      const match = line.match(/protein[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 50);
        parsed.protein_g = val;
        break;
      }
    }
  }

  // 7. Dietary Fibre
  for (const line of lines) {
    if (/fib(?:re|er)/i.test(line)) {
      const match = line.match(/fib(?:re|er)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 40);
        parsed.dietary_fibre_g = val;
        break;
      }
    }
  }

  // 8. Carbohydrates
  for (const line of lines) {
    if (/carbohydrates?|total\s*carb/i.test(line)) {
      const match = line.match(/(?:carbohydrates?|total\s*carb)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 100);
        parsed.carbohydrate_g = val;
        break;
      }
    }
  }

  // 9. Ingredients text extraction
  const ingredientsMatch = cleanText.match(/(?:ingredients?|contains?:?)\s*[:\-]?\s*([\s\S]+?)(?:nutrition|guaranteed|smartlabel|call|for\s*more|allerg(?:y|ens?)|protect|store\s*in|\n\n|$)/i);
  if (ingredientsMatch) {
    parsed.ingredients_text = ingredientsMatch[1].replace(/\n+/g, ' ').trim();
  } else {
    const foodWords = ['peanut', 'peanuts', 'potato', 'potatoes', 'wheat', 'oil', 'salt', 'sugar', 'maida', 'milk', 'protein'];
    const matchedWords = foodWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(cleanText));
    if (matchedWords.length >= 2) {
      parsed.ingredients_text = cleanText;
    }
  }

  // Serving Basis
  const servingMatch = cleanText.match(/(?:per\s*100\s*(?:g|ml)|serving\s*size[^\n]+|per\s*40\s*(?:gm|g)|per\s*serve[^\n]*)/i);
  if (servingMatch) {
    parsed.serving_size = servingMatch[0].trim();
  } else {
    parsed.serving_size = "per 100g (Assumed standard basis)";
  }

  return parsed;
}
