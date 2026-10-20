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

  const extractNumbersFromLine = (line) => {
    const matches = line.match(/(?:<|less\s*than)?\s*(\d+(?:[.,]\d+)?)\s*(?:kcal|kj|g|mg|%)?/gi) || [];
    const nums = [];
    for (const m of matches) {
      const isLessThan = /<|less/i.test(m);
      const val = parseNumber(m);
      if (val !== null) {
        nums.push(isLessThan ? Math.max(0.5, val * 0.5) : val);
      }
    }
    return nums;
  };

  // 1. Energy (kcal or kJ or Calories)
  for (const line of lines) {
    if (/calories|energy|caloric\s*value/i.test(line) && !/from\s*fat/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      const kcals = nums.filter(n => n >= 20 && n <= 1000);
      if (kcals.length > 0) {
        parsed.energy_kcal = Math.max(...kcals);
        break; // Stop immediately once valid kcal line is found
      }
      const kjs = nums.filter(n => n > 1000);
      if (kjs.length > 0 && parsed.energy_kcal === null) {
        parsed.energy_kcal = Math.round(Math.max(...kjs) / 4.184);
        break;
      }
    }
  }

  // Fallback for Calories if line didn't match
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
      const nums = extractNumbersFromLine(line);
      const fatGrams = nums.filter(n => n <= 100);
      if (fatGrams.length > 0) {
        parsed.total_fat_g = fatGrams.length > 1 ? Math.max(...fatGrams) : fatGrams[0];
        break;
      }
    }
  }
  if (parsed.total_fat_g === null) {
    const fatMatch = cleanText.match(/total\s*fa[it][^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
    if (fatMatch) parsed.total_fat_g = parseNumber(fatMatch[1]);
  }

  // 3. Saturated Fat
  for (const line of lines) {
    if (/satura[tl]ed\s*fa[it]|sat\s*fa[it]|saturates/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      const satGrams = nums.filter(n => n <= 100);
      if (satGrams.length > 0) {
        parsed.saturated_fat_g = satGrams.length > 1 ? Math.max(...satGrams) : satGrams[0];
        break;
      }
    }
  }
  if (parsed.saturated_fat_g === null) {
    const satMatch = cleanText.match(/(?:satura[tl]ed\s*fa[it]|sat\s*fa[it])[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|9)?/i);
    if (satMatch) parsed.saturated_fat_g = parseNumber(satMatch[1]);
  }

  // 4. Total Sugars & Added Sugars
  for (const line of lines) {
    if (/total\s*sugars?|sugars?/i.test(line) && !/added/i.test(line)) {
      const isLessThan = /less\s*than|</i.test(line);
      const nums = extractNumbersFromLine(line);
      const sugGrams = nums.filter(n => n <= 100);
      if (sugGrams.length > 0) {
        parsed.total_sugars_g = isLessThan ? 0.5 : (sugGrams.length > 1 ? Math.max(...sugGrams) : sugGrams[0]);
        break;
      }
    }
  }
  if (parsed.total_sugars_g === null) {
    const sugMatch = cleanText.match(/(?:total\s*sugars?|sugars?)[^\d\n]*?(?:less\s*than|<)?\s*(\d+(?:[.,]\d+)?)\s*g?/i);
    if (sugMatch) {
      const isLessThan = /less\s*than|</i.test(sugMatch[0]);
      const val = parseNumber(sugMatch[1]);
      parsed.total_sugars_g = isLessThan ? 0.5 : val;
    }
  }

  // Added Sugars
  const addedSugarMatch = cleanText.match(/(?:added\s*sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*g?/i);
  if (addedSugarMatch) parsed.added_sugars_g = parseNumber(addedSugarMatch[1]);

  // 5. Sodium & Salt
  for (const line of lines) {
    if (/sodium/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      if (nums.length > 0) {
        const sods = nums.filter(n => n >= 5);
        if (sods.length > 0) {
          parsed.sodium_mg = sods.length > 1 ? Math.max(...sods) : sods[0];
          break;
        }
      }
    }
  }
  if (parsed.sodium_mg === null) {
    const sodMatch = cleanText.match(/sodium[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:mg)?/i);
    if (sodMatch) {
      let val = parseNumber(sodMatch[1]);
      if (val !== null) {
        if (val < 10 && !cleanText.includes('mg')) val = val * 1000;
        parsed.sodium_mg = val;
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
    if (/protein/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      const prot = nums.filter(n => n <= 100);
      if (prot.length > 0) {
        parsed.protein_g = prot.length > 1 ? Math.max(...prot) : prot[0];
        break;
      }
    }
  }

  // 7. Dietary Fibre
  for (const line of lines) {
    if (/fib(?:re|er)/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      const fib = nums.filter(n => n <= 100);
      if (fib.length > 0) {
        parsed.dietary_fibre_g = fib.length > 1 ? Math.max(...fib) : fib[0];
        break;
      }
    }
  }

  // 8. Carbohydrates
  for (const line of lines) {
    if (/carbohydrates?|total\s*carb/i.test(line)) {
      const nums = extractNumbersFromLine(line);
      const carb = nums.filter(n => n <= 100);
      if (carb.length > 0) {
        parsed.carbohydrate_g = carb.length > 1 ? Math.max(...carb) : carb[0];
        break;
      }
    }
  }

  // 9. Ingredients text extraction
  const ingredientsMatch = cleanText.match(/(?:ingredients?|contains?:?)\s*[:\-]?\s*([\s\S]+?)(?:nutrition|guaranteed|smartlabel|call|for\s*more|allerg(?:y|ens?)|protect|store\s*in|\n\n|$)/i);
  if (ingredientsMatch) {
    parsed.ingredients_text = ingredientsMatch[1].replace(/\n+/g, ' ').trim();
  } else {
    const foodWords = ['peanut', 'peanuts', 'potato', 'potatoes', 'wheat', 'oil', 'salt', 'sugar', 'maida', 'milk'];
    const matchedWords = foodWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(cleanText));
    if (matchedWords.length >= 2) {
      parsed.ingredients_text = cleanText;
    }
  }

  // Serving Basis
  const servingMatch = cleanText.match(/(?:per\s*100\s*(?:g|ml)|serving\s*size[^\n]+|per\s*serve[^\n]*)/i);
  if (servingMatch) {
    parsed.serving_size = servingMatch[0].trim();
  } else {
    parsed.serving_size = "per 100g (Assumed standard basis)";
  }

  return parsed;
}
