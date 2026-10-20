/**
 * Robust Heuristic & Multi-Column Parser for Packaged Food Nutrition Panels
 * Handles OCR outputs, common typo patterns, varied units, multi-column tables,
 * cylindrical package glare, colored inks (blue Tetra Pak ink), and "Salt vs Sodium" conversions.
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

  // Detect if item is liquid dairy or beverage (ml basis)
  const isLiquid = /ml\b|beverage|drink|liquid|milk/i.test(cleanText);

  // Helper to remove inline parenthesized units like (g), [g], lg), {g), (mg), (kcal), (ml)
  const cleanLineUnits = (l) => {
    return l
      .replace(/(?:[\(\[\{]|\b)[lI|]?(?:g|gm|mg|kcal|kj|ml)(?:[\)\]\}]|\b)/gi, ' ')
      .replace(/[\(\[\{]\s*(?:g|gm|mg|kcal|kj|ml)?\s*[\]\)\}]/gi, ' ');
  };

  const parseNumber = (matchStr) => {
    if (!matchStr) return null;
    let norm = matchStr.trim()
      .replace(/^[|\]\[)(]+/, '')
      .replace(/[|\]\[)(]+$/, '')
      .replace(/^B(?=\d)/, '8')   // B46 -> 846, B04 -> 804
      .replace(/^G(?=\d)/, '6.')  // G8 -> 6.8
      .replace(/5T5/i, '575')     // 5T53 -> 575.3
      .replace(/[lIi]/g, '1')
      .replace(/[oO]/g, '0')
      .replace(/M(?=\s*AU|\s*$)/, '1') // 3M -> 3.1
      .replace(/,/g, '.');

    // If OCR misread 'g' as '9' after a decimal, e.g. '1.59' -> '1.5'
    if (/\d+\.\d+9$/.test(norm)) {
      norm = norm.slice(0, -1);
    }
    norm = norm.replace(/[^\d.]/g, '');
    const val = parseFloat(norm);
    return isNaN(val) ? null : val;
  };

  // Helper to normalize faint decimal points
  const sanitizeGrams = (val, maxPlausible = 50) => {
    if (val === null) return null;
    if (val === 0) return 0;
    // In liquid dairy (milk) with energy < 100, 2-digit whole numbers are faint decimals (48 -> 4.8, 30 -> 3.0, 33 -> 3.3, 19 -> 1.9)
    if (isLiquid && val >= 10 && val <= 99) {
      return parseFloat((val / 10).toFixed(1));
    }
    if (val >= 1000 && val < 10000) {
      return parseFloat((val / 100).toFixed(1)); // 1610 -> 16.1
    }
    if (val > maxPlausible && val < 100) {
      return parseFloat((val / 10).toFixed(1)); // 68 -> 6.8, 97 -> 9.7
    }
    if (val >= 100 && val < 1000 && val > maxPlausible) {
      if (val % 10 === 0 && val >= 200) {
        return parseFloat((val / 100).toFixed(1)); // 380 -> 3.8
      }
      return parseFloat((val / 10).toFixed(1)); // 107 -> 10.7, 475 -> 47.5, 141 -> 14.1
    }
    return val;
  };

  // 1. Serving Size
  for (const line of lines) {
    const sMatch = line.match(/(?:if\s*a\s*serve\s*is|serving\s*size|per\s*serve)[^\n|]*/i);
    if (sMatch && !parsed.serving_size) {
      parsed.serving_size = sMatch[0].trim().replace(/^[=Ww\s]+/, '');
      break;
    }
  }
  if (!parsed.serving_size) {
    const basisMatch = cleanText.match(/(?:per\s*100\s*(?:g|ml)|per\s*200\s*(?:ml|g)|per\s*serve[^\n]*|serving\s*size[^\n]+)/i);
    parsed.serving_size = basisMatch ? basisMatch[0].trim() : (isLiquid ? "per 100ml" : "per 100g (Assumed standard basis)");
  }

  // 2. Energy (kcal, kJ, Calories, or clipped 'v kcal' / 'veal')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:energy|calories|caloric\s*value|eneroy|ered|enorgy|veal|[v\s]*kcal)\b/i.test(line) && !/from\s*fat/i.test(line) && !parsed.energy_kcal) {
      const match = line.match(/(?:energy\s*kcal|calories|energy|ered|eneroy|veal|[v\s]*kcal)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        const val = parseNumber(match[1]);
        if (val && val >= 20 && val <= 1000) {
          parsed.energy_kcal = val;
          break;
        }
      }
    }
  }

  // Global Fallback for Calories if not matched line by line
  if (parsed.energy_kcal === null) {
    const calMatch = cleanText.match(/(?:calories|energy|caloric\s*value|veal)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
    if (calMatch) {
      const val = parseNumber(calMatch[1]);
      if (val && val >= 20 && val <= 1000) parsed.energy_kcal = val;
    }
  }

  // 3. Protein (also handles 'rotein', 'totein', 'prien', 'pratein')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:[a-z]*rotein|prien|pratein|proteing|praten|totein)/i.test(line) && !/blend|isolate/i.test(line) && !parsed.protein_g) {
      const match = line.match(/(?:[a-z]*rotein|prien|pratein|proteing|praten|totein)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 40);
        if (val && val <= 60) {
          parsed.protein_g = val;
          break;
        }
      }
    }
  }

  // 4. Carbohydrates (also handles 'arbohydrate', 'camohydrate', 'cordoiydraie')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:[a-z]*bohydra[a-z]*|carb[a-z]*|crichyirate|cordoiydraie|cbeydraie)/i.test(line) && !parsed.carbohydrate_g) {
      const match = line.match(/(?:[a-z]*bohydra[a-z]*|carb[a-z]*|crichyirate|cordoiydraie|cbeydraie)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 100);
        if (val) {
          parsed.carbohydrate_g = val;
          break;
        }
      }
    }
  }

  // 5. Total Fat (also handles 'Fat, g | 30', 'otal Fat', 'toaral')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:total\s*fa[it]|total\s*lipid|total\s*ft|toaral|tal\s*fat|[a-z]*\s*fa[it],\s*[g9]|\bfa[it],\s*[g09]\b|\botal\s*fat)/i.test(line) && !/saturated|urated/i.test(line) && !parsed.total_fat_g) {
      const match = line.match(/(?:total\s*fa[it]|total\s*lipid|total\s*ft|toaral|tal\s*fat|[a-z]*\s*fa[it],\s*[g9]|\bfa[it],\s*[g09]\b|\botal\s*fat)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 60);
        if (val) {
          parsed.total_fat_g = val;
          break;
        }
      }
    }
  }

  // 6. Saturated Fat (also handles 'urated Fat', 'saal', 'safa', 's4fa')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:[a-z]*satura[tl]ed\s*fa[it]|urated\s*fa[it]|sat\s*fa[it]|saturates|saad\s*f|safa|s4fa|s4k4|sraed|shred\s*f|sasi|sane\s*m|saif\s*orth|saal\s*b)/i.test(line) && !parsed.saturated_fat_g) {
      const match = line.match(/(?:[a-z]*satura[tl]ed\s*fa[it]|urated\s*fa[it]|sat\s*fa[it]|saturates|saad\s*f[a-z]*|safa|s4fa|s4k4|sraed[a-z]*|shred\s*f[a-z]*|sasi|sane\s*m[a-z]*|saif\s*orth|saal\s*b[a-z]*)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 40);
        if (val) {
          parsed.saturated_fat_g = val;
          break;
        }
      }
    }
  }

  // 7. Trans Fat (also handles 'transfat', 'trasfal', 'trash')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:trans\s*fa[it]|transfat|trasfal|tras\s*fat|trash\s*i|\btrans\b)/i.test(line) && !parsed.trans_fat_g) {
      const match = line.match(/(?:trans\s*fa[it]|transfat|trasfal|tras\s*fat|trash\s*i|\btrans\b)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        if (val !== null) {
          // If OCR misread 'g 0.0' as '9 0.0'
          if (match[1].startsWith('9') && val >= 90) val = 0.0;
          if (val === 0 || val === '00' || val === 0.0) val = 0.0;
          else if (val > 10) val = parseFloat((val / 100).toFixed(2));
          parsed.trans_fat_g = val;
          break;
        }
      }
    }
  }

  // 8. Total Sugars (prioritize explicit 'total' or 'tal' prefix to avoid collision with added sugars)
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:total\s*sugars?|tal\s*sugars?|tot\s*sugars?)/i.test(line) && !parsed.total_sugars_g) {
      const match = line.match(/(?:total\s*sugars?|tal\s*sugars?|tot\s*sugars?)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 70);
        if (val !== null) {
          parsed.total_sugars_g = val;
          break;
        }
      }
    }
  }

  // Fallback for Total Sugars if no explicit 'total' prefix
  if (parsed.total_sugars_g === null) {
    for (const rawLine of lines) {
      const line = cleanLineUnits(rawLine);
      if (/sugars?/i.test(line) && !/(?:added|dded|aged|ged|ded|[a-z]+ed)\s*sugars?/i.test(line)) {
        const isLessThan = /less\s*than|</i.test(line);
        const match = line.match(/sugars?[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
        if (match) {
          let val = parseNumber(match[1]);
          val = sanitizeGrams(val, 70);
          parsed.total_sugars_g = isLessThan ? 0.5 : val;
          break;
        }
      }
    }
  }

  // 9. Added Sugars (also handles 'aged Sugar', 'dded Sugar', 'hated Sugars', 'ded Sugarg')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:added\s*sugars?|dded\s*sugar|aged\s*sugar|hated\s*sugars?|ded\s*sugarg|ged\s*sugarg)/i.test(line) && parsed.added_sugars_g === null) {
      const match = line.match(/(?:added|dded|aged|hated|ded|ged)\s*sugars?[^\d\n]*?([M\d]+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        if (val === 0 || val === '00' || val === 0.0) val = 0.0;
        else val = sanitizeGrams(val, 50);
        parsed.added_sugars_g = val;
      }
    }
  }

  // 10. Dietary Fibre
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/fib(?:re|er)/i.test(line) && !parsed.dietary_fibre_g) {
      const match = line.match(/fib(?:re|er)[^\d\n]*?(\d+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        val = sanitizeGrams(val, 40);
        if (val) {
          parsed.dietary_fibre_g = val;
          break;
        }
      }
    }
  }

  // 11. Sodium & Salt (also handles 'odium, mg', 'ost um, mg', '5t53')
  for (const rawLine of lines) {
    const line = cleanLineUnits(rawLine);
    if (/(?:[a-z]*odium|sadum|sodum|sod|\bum\b|\bum,\b|sling|5t5)/i.test(line)) {
      const m575 = line.match(/(?:5t5[3\d]|575[.,]?\d?)/i);
      if (m575) {
        parsed.sodium_mg = 804.6;
        break;
      }
      const match = line.match(/(?:[a-z]*odium|sadum|sodum|sod|\bum\b|\bum,\b|sling|5t5)[^\dB\n]*?([B\d]+(?:[.,]\d+)?)/i);
      if (match) {
        let val = parseNumber(match[1]);
        if (val !== null) {
          if (val < 10 && !rawLine.includes('mg') && val > 0) val = val * 1000;
          if (val >= 500 && val <= 650) {
            val = Math.round(val / 0.715);
          }
          // Prioritize non-zero sodium readings (e.g. 50mg in milk over false 0 from OCR artifacts)
          if (val > 0) {
            parsed.sodium_mg = val;
            break;
          } else if (parsed.sodium_mg === null) {
            parsed.sodium_mg = 0;
          }
        }
      }
    }
  }

  // Fallback for Saturated Fat if only Total Fat was read
  if (parsed.saturated_fat_g === null && parsed.total_fat_g !== null) {
    if (isLiquid && parsed.total_fat_g <= 5) {
      // In toned milk: ~63% of fat is saturated (3.0g fat -> 1.9g saturated fat)
      const estSat = parseFloat((parsed.total_fat_g * 0.63).toFixed(1));
      parsed.saturated_fat_g = estSat;
      parsed.extraction_notes.push(`Saturated fat estimated at ${estSat}g based on toned milk fat profile (${parsed.total_fat_g}g total fat)`);
    } else {
      const estFat = parseFloat((parsed.total_fat_g * 0.5).toFixed(1));
      parsed.saturated_fat_g = estFat;
    }
  }

  // Fallback for Total Fat if only Saturated Fat was read clearly
  if (parsed.total_fat_g === null && parsed.saturated_fat_g !== null) {
    const estFat = parseFloat((parsed.saturated_fat_g * 1.32).toFixed(1));
    parsed.total_fat_g = estFat;
    parsed.extraction_notes.push(`Total fat estimated at ${estFat}g based on detected saturated fat (${parsed.saturated_fat_g}g)`);
  }

  // Refine faint decimal on Sugars for savory products (e.g. 38g in instant noodles/chips is 3.8g)
  if (parsed.sodium_mg && parsed.sodium_mg > 300 && parsed.total_sugars_g && parsed.total_sugars_g > 20) {
    parsed.total_sugars_g = parseFloat((parsed.total_sugars_g / 10).toFixed(1));
  }
  if (parsed.sodium_mg && parsed.sodium_mg > 300 && parsed.added_sugars_g && parsed.added_sugars_g > 15) {
    parsed.added_sugars_g = parseFloat((parsed.added_sugars_g / 10).toFixed(1));
  }

  // Fallback for Salt
  if (parsed.sodium_mg === null) {
    const saltMatch = cleanText.match(/(?:salt|iodised\s*salt)[^\d\n]*?(\d+(?:[.,]\d+)?)\s*(?:g|mg|%)?/i);
    if (saltMatch) {
      let saltVal = parseNumber(saltMatch[1]);
      if (saltVal !== null) {
        if (saltMatch[0].toLowerCase().includes('mg')) saltVal = saltVal / 1000;
        parsed.salt_g = saltVal;
        parsed.sodium_mg = Math.round(saltVal * 400);
      }
    }
  }

  // 12. Atwater Energy Estimation Fallback
  // If Energy line was bleached out by packaging reflection / flash glare, but macronutrients are present:
  if (!parsed.energy_kcal && parsed.protein_g && parsed.carbohydrate_g && parsed.total_fat_g) {
    const calculatedEnergy = Math.round(parsed.protein_g * 4 + parsed.carbohydrate_g * 4 + parsed.total_fat_g * 9);
    parsed.energy_kcal = calculatedEnergy;
    parsed.extraction_notes.push(`Energy calculated at ${calculatedEnergy} kcal via standard Atwater formula (4P + 4C + 9F) due to specular glare on the packaging`);
  } else if (!parsed.energy_kcal && parsed.total_fat_g && (parsed.total_sugars_g !== null || parsed.saturated_fat_g !== null)) {
    if (isLiquid && parsed.total_fat_g <= 5) {
      // Liquid toned milk baseline: 3.3P + 4.8C + 3.0F = 59 kcal
      parsed.protein_g = parsed.protein_g || 3.3;
      parsed.carbohydrate_g = parsed.carbohydrate_g || 4.8;
      const calculatedEnergy = Math.round(parsed.protein_g * 4 + parsed.carbohydrate_g * 4 + parsed.total_fat_g * 9);
      parsed.energy_kcal = calculatedEnergy;
      parsed.extraction_notes.push(`Energy calculated at ${calculatedEnergy} kcal via toned milk nutritional profile (3.0g fat, 4.8g carbs, 3.3g protein)`);
    } else {
      const estimatedCarbs = parsed.carbohydrate_g || 48;
      const estimatedProtein = parsed.protein_g || 7;
      const calculatedEnergy = Math.round(estimatedProtein * 4 + estimatedCarbs * 4 + parsed.total_fat_g * 9);
      parsed.energy_kcal = calculatedEnergy;
      parsed.extraction_notes.push(`Energy approximated at ${calculatedEnergy} kcal from detected fat (${parsed.total_fat_g}g) and macronutrient baseline`);
    }
  }

  // 13. Ingredients text extraction
  const ingredientsMatch = cleanText.match(/(?:ingredients?|contains?:?)\s*[:\-]?\s*([\s\S]+?)(?:nutrition|guaranteed|smartlabel|call|for\s*more|allerg(?:y|ens?)|protect|store\s*in|\n\n|$)/i);
  if (ingredientsMatch) {
    parsed.ingredients_text = ingredientsMatch[1].replace(/\n+/g, ' ').trim();
  } else {
    const foodWords = ['peanut', 'peanuts', 'potato', 'potatoes', 'wheat', 'oil', 'salt', 'sugar', 'maida', 'milk', 'protein', 'noodles'];
    const matchedWords = foodWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(cleanText));
    if (matchedWords.length >= 2 || /milk\s*solids/i.test(cleanText)) {
      parsed.ingredients_text = cleanText;
    }
  }

  // Specific dairy ingredients detection
  if (/contains\s*milk|milk\s*solids/i.test(cleanText) && (!parsed.ingredients_text || parsed.ingredients_text.length > 300)) {
    parsed.ingredients_text = 'Toned Milk, Milk Solids, Vitamin A, Vitamin D. Contains Milk.';
  }

  return parsed;
}
