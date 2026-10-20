import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { GoogleGenAI, Type } from '@google/genai';

import { parseNutritionText } from './engine/parser.js';
import { evaluateFoodProduct } from './engine/rules-engine.js';
import { computeCumulativeAnalysis } from './engine/cumulative.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for in-memory image handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Load presets
const presetsPath = path.join(__dirname, 'data/presets.json');
const presetsData = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Label Lens Backend Engine', timestamp: new Date().toISOString() });
});

// 2. Presets endpoint for 1-click live demo
app.get('/api/presets', (req, res) => {
  const enriched = presetsData.presets.map(item => {
    const evaluation = evaluateFoodProduct({
      ...item.nutrients,
      ingredients_text: item.ingredients
    });
    return {
      ...item,
      evaluation
    };
  });
  res.json({ presets: enriched });
});

// 3. Analyze Pasted or Form-based Text / Manual Recalculation
app.post('/api/analyze-text', (req, res) => {
  try {
    const { text, manualNutrients } = req.body;

    let parsedNutrients = {};
    if (manualNutrients) {
      parsedNutrients = {
        energy_kcal: manualNutrients.energy_kcal !== undefined && manualNutrients.energy_kcal !== '' ? parseFloat(manualNutrients.energy_kcal) : null,
        total_sugars_g: manualNutrients.total_sugars_g !== undefined && manualNutrients.total_sugars_g !== '' ? parseFloat(manualNutrients.total_sugars_g) : null,
        saturated_fat_g: manualNutrients.saturated_fat_g !== undefined && manualNutrients.saturated_fat_g !== '' ? parseFloat(manualNutrients.saturated_fat_g) : null,
        total_fat_g: manualNutrients.total_fat_g !== undefined && manualNutrients.total_fat_g !== '' ? parseFloat(manualNutrients.total_fat_g) : null,
        sodium_mg: manualNutrients.sodium_mg !== undefined && manualNutrients.sodium_mg !== '' ? parseFloat(manualNutrients.sodium_mg) : null,
        protein_g: manualNutrients.protein_g !== undefined && manualNutrients.protein_g !== '' ? parseFloat(manualNutrients.protein_g) : null,
        dietary_fibre_g: manualNutrients.dietary_fibre_g !== undefined && manualNutrients.dietary_fibre_g !== '' ? parseFloat(manualNutrients.dietary_fibre_g) : null,
        serving_size: manualNutrients.serving_size || 'per 100g',
        ingredients_text: manualNutrients.ingredients_text || text || ''
      };
    } else {
      parsedNutrients = parseNutritionText(text || '');
    }

    const evaluation = evaluateFoodProduct(parsedNutrients);

    res.json({
      success: true,
      raw_text: text || '',
      parsed_nutrients: parsedNutrients,
      evaluation
    });
  } catch (err) {
    console.error('Error analyzing text:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function for modular OCR processing of a single image buffer
async function processImageOcr(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const targetWidth = Math.max(1600, Math.min(2600, (metadata.width || 800) * 2.5));

  const worker = await createWorker('eng');

  const recognizeAtAngle = async (angle) => {
    const buffer = await sharp(imageBuffer)
      .rotate(angle)
      .resize({ width: Math.round(targetWidth), kernel: 'lanczos3' })
      .grayscale()
      .normalise()
      .sharpen()
      .toBuffer();
    const ret = await worker.recognize(buffer);
    const text = ret.data.text || '';
    const keywords = ['energy', 'calories', 'protein', 'fat', 'sugar', 'sodium', 'safa', 'carb', 'ingredients'];
    const score = keywords.reduce((acc, kw) => acc + (new RegExp(kw, 'i').test(text) ? 1 : 0), 0);
    return { angle, score, text, confidence: ret.data.confidence };
  };

  // 1. Try 0° first
  let best = await recognizeAtAngle(0);

  // 2. If weak detection (< 2 keywords), test 270° and 90°
  if (best.score < 2) {
    const r270 = await recognizeAtAngle(270);
    if (r270.score > best.score) {
      best = r270;
    }
    if (best.score < 2) {
      const r90 = await recognizeAtAngle(90);
      if (r90.score > best.score) {
        best = r90;
      }
    }
  }

  // 3. High-contrast linear pass at the selected orientation
  try {
    const hcBuf = await sharp(imageBuffer)
      .rotate(best.angle)
      .resize({ width: 2400 })
      .grayscale()
      .linear(1.5, -40)
      .toBuffer();
    const hcRet = await worker.recognize(hcBuf);
    if (hcRet.data && hcRet.data.text) {
      best.text = best.text + '\n' + hcRet.data.text;
    }
  } catch (passErr) {
    console.warn('High-contrast OCR pass non-fatal warning:', passErr);
  }

  // 4. Red-channel pass
  try {
    const redBuf = await sharp(imageBuffer)
      .rotate(best.angle)
      .extractChannel('red')
      .resize({ width: 2200 })
      .normalize()
      .toBuffer();
    const redRet = await worker.recognize(redBuf);
    if (redRet.data && redRet.data.text) {
      best.text = best.text + '\n' + redRet.data.text;
    }
  } catch (redErr) {
    console.warn('Red-channel OCR pass non-fatal warning:', redErr);
  }

  await worker.terminate();
  return best;
}

// 4. Optical Character Recognition (OCR) / Vision on Image(s) - Supports single & multi-product analysis
app.post('/api/analyze-image', upload.any(), async (req, res) => {
  try {
    const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    const requestedEngine = (req.body.engine || 'tesseract').toLowerCase();
    console.log(`Processing ${files.length} image(s): ${files.map(f => f.originalname).join(', ')}, Engine: ${requestedEngine}`);

    let fallbackReason = null;

    // --- ENGINE 1: Multimodal AI Vision ---
    if (requestedEngine === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || req.body.gemini_api_key;
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'AI Vision API key is not configured in your backend .env file. Please add GEMINI_API_KEY to your .env file and restart the server, or turn off the AI Vision toggle to use local offline OCR.'
        });
      }

      console.log('Invoking Google Gemini Flash Vision (@google/genai)...');
      const ai = new GoogleGenAI({ apiKey });

      const imageParts = files.map(f => ({
        inlineData: {
          data: f.buffer.toString('base64'),
          mimeType: f.mimetype || 'image/jpeg'
        }
      }));

      const prompt = `You are an expert food safety, nutrition, and regulatory compliance analyst specializing in FSSAI (Food Safety and Standards Authority of India) food labeling regulations.
Analyze the provided food packaging image(s).

CRITICAL MULTI-PRODUCT & COMBO INSTRUCTIONS:
1. The image(s) may contain ONE OR MORE distinct food products (either multiple products within a single photo, or separate products across multiple uploaded photos, e.g. milk, bread, cup noodles, snacks, biscuits).
2. Detect and extract every distinct food product individually.
3. For each detected product, extract its product name, brand, and nutritional facts standardized to "per 100g" (or "per 100ml" for liquids/dairy/beverages) basis as required by FSSAI.
4. If values on packaging are presented per serving (e.g. per 30g), mathematically convert them to per 100g or per 100ml. If serving size is not indicated, state the basis in serving_size.
5. If energy is not explicitly printed or is 0, estimate it using the 4-4-9 Atwater factor: (Protein * 4) + (Carbohydrate * 4) + (Fat * 9).
6. If only salt is reported, convert to sodium: sodium_mg = salt_g * 400.
7. Extract the entire ingredients text verbatim from the package if present.
8. If only one product is present across the image(s), return an array with exactly that one product item.
9. Provide a concise combo_title summarizing the meal or items (e.g., "Toned Milk and Cuppa Noodles", or the single product name if only one).`;

      try {
        const candidateModels = ['gemini-3-flash-preview', 'gemini-3.7-flash', 'gemini-flash-latest'];
        let response = null;
        let activeModel = 'gemini-3-flash-preview';
        let lastErr = null;

        for (const modelCandidate of candidateModels) {
          try {
            console.log(`Attempting AI Vision generation with model: ${modelCandidate}...`);
            response = await ai.models.generateContent({
              model: modelCandidate,
              contents: [
                ...imageParts,
                prompt
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    combo_title: { type: Type.STRING, description: 'Descriptive title for the meal combo or single product' },
                    products: {
                      type: Type.ARRAY,
                      description: 'List of individual food products detected across the image(s)',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          product_name: { type: Type.STRING, description: 'Product title or trade name from package' },
                          brand: { type: Type.STRING, description: 'Brand or manufacturer name' },
                          serving_size: { type: Type.STRING, description: 'Serving basis, e.g. "per 100g", "per 100ml", "per 70g pack"' },
                          energy_kcal: { type: Type.NUMBER, description: 'Energy in kcal per 100g or per 100ml' },
                          total_fat_g: { type: Type.NUMBER, description: 'Total fat in grams per 100g or per 100ml' },
                          saturated_fat_g: { type: Type.NUMBER, description: 'Saturated fat in grams per 100g or per 100ml' },
                          trans_fat_g: { type: Type.NUMBER, description: 'Trans fat in grams per 100g or per 100ml' },
                          carbohydrate_g: { type: Type.NUMBER, description: 'Total carbohydrates in grams per 100g or per 100ml' },
                          total_sugars_g: { type: Type.NUMBER, description: 'Total sugars in grams per 100g or per 100ml' },
                          added_sugars_g: { type: Type.NUMBER, description: 'Added sugars in grams per 100g or per 100ml' },
                          dietary_fibre_g: { type: Type.NUMBER, description: 'Dietary fibre in grams per 100g or per 100ml' },
                          protein_g: { type: Type.NUMBER, description: 'Protein in grams per 100g or per 100ml' },
                          sodium_mg: { type: Type.NUMBER, description: 'Sodium in milligrams per 100g or per 100ml' },
                          ingredients_text: { type: Type.STRING, description: 'Complete ingredient list as printed on packaging' }
                        }
                      }
                    }
                  }
                }
              }
            });
            if (response && response.text) {
              activeModel = modelCandidate;
              break;
            }
          } catch (modelErr) {
            console.warn(`Model ${modelCandidate} failed (${modelErr.status || modelErr.message}), trying next candidate...`);
            lastErr = modelErr;
          }
        }

        if (!response || !response.text) {
          throw lastErr || new Error('No candidate AI Vision model responded successfully');
        }

        const extracted = JSON.parse(response.text);
        const rawProducts = (extracted.products && extracted.products.length > 0)
          ? extracted.products
          : [extracted];

        const processedProducts = rawProducts.map((p, idx) => {
          if ((!p.energy_kcal || p.energy_kcal === 0) && (p.protein_g || p.carbohydrate_g || p.total_fat_g)) {
            p.energy_kcal = Math.round((p.protein_g || 0) * 4 + (p.carbohydrate_g || 0) * 4 + (p.total_fat_g || 0) * 9);
          }
          const evaluation = evaluateFoodProduct(p);
          return {
            id: `prod-${idx + 1}`,
            product_name: p.product_name || `Product ${idx + 1}`,
            brand: p.brand || 'Detected Brand',
            serving_size: p.serving_size || 'per 100g',
            nutrients: p,
            evaluation
          };
        });

        const cumulative = computeCumulativeAnalysis(processedProducts);
        const isCombo = cumulative.is_combo;
        const mainProd = processedProducts[0];

        return res.json({
          success: true,
          engine_used: 'gemini',
          model: activeModel,
          is_cumulative: isCombo,
          product_count: processedProducts.length,
          combo_title: extracted.combo_title || cumulative.combo_title,
          cumulative: cumulative,
          products: cumulative.products,
          // Backwards-compatible top-level keys:
          product_name: isCombo ? cumulative.combo_title : mainProd.product_name,
          brand: isCombo ? `${processedProducts.length} Items Meal Combo` : mainProd.brand,
          parsed_nutrients: isCombo ? cumulative.cumulative_nutrients : mainProd.nutrients,
          evaluation: isCombo ? cumulative.evaluation : mainProd.evaluation,
          raw_text: response.text
        });

      } catch (aiErr) {
        console.warn('AI Vision cloud temporarily busy/unavailable. Falling back smoothly to local offline OCR pipeline:', aiErr.message);
        fallbackReason = 'Cloud AI Vision temporarily experienced high demand (503). Analysis smoothly completed via on-device Local OCR.';
        // Smoothly proceed to Engine 2 below!
      }
    }

    // --- ENGINE 2: Local Offline Sharp + Tesseract OCR Pipeline ---
    const localProducts = [];
    let combinedRawOcrText = '';
    let lastConfidence = 0;
    let lastOrientation = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ocrResult = await processImageOcr(file.buffer);
      combinedRawOcrText += `\n--- [Image ${i + 1}: ${file.originalname}] ---\n` + ocrResult.text;
      lastConfidence = ocrResult.confidence;
      lastOrientation = ocrResult.angle;

      const parsedNutrients = parseNutritionText(ocrResult.text);
      const evaluation = evaluateFoodProduct(parsedNutrients);
      localProducts.push({
        id: `prod-${i + 1}`,
        product_name: file.originalname.replace(/\.[^/.]+$/, ''),
        brand: 'Local OCR Detection',
        serving_size: parsedNutrients.serving_size || 'per 100g',
        nutrients: parsedNutrients,
        evaluation
      });
    }

    const cumulative = computeCumulativeAnalysis(localProducts);
    const isCombo = cumulative.is_combo;
    const mainProd = localProducts[0];

    return res.json({
      success: true,
      engine_used: 'tesseract',
      fallback_triggered: !!fallbackReason,
      fallback_message: fallbackReason || null,
      is_cumulative: isCombo,
      product_count: localProducts.length,
      combo_title: cumulative.combo_title,
      cumulative: cumulative,
      products: cumulative.products,
      product_name: isCombo ? cumulative.combo_title : mainProd.product_name,
      brand: isCombo ? `${localProducts.length} Items Meal Combo` : mainProd.brand,
      parsed_nutrients: isCombo ? cumulative.cumulative_nutrients : mainProd.nutrients,
      evaluation: isCombo ? cumulative.evaluation : mainProd.evaluation,
      raw_ocr_text: combinedRawOcrText.trim(),
      orientation_angle: lastOrientation,
      confidence: lastConfidence
    });
  } catch (err) {
    console.error('Error processing OCR image:', err);
    res.status(500).json({ success: false, error: 'Failed to process image: ' + err.message });
  }
});

// 5. Side-by-Side Comparison Endpoint
app.post('/api/compare', (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 products to compare' });
    }

    const compared = products.map((prod, idx) => {
      let evaluation = prod.evaluation;
      if (!evaluation || evaluation.is_incomplete) {
        const parsed = prod.nutrients ? { ...prod.nutrients, ingredients_text: prod.ingredients || '' } : parseNutritionText(prod.text || '');
        evaluation = evaluateFoodProduct(parsed);
      }
      return {
        id: prod.id || `product-${idx + 1}`,
        name: prod.name || `Product ${idx + 1}`,
        brand: prod.brand || 'Brand',
        nutrients: prod.nutrients || {},
        evaluation
      };
    });

    // Determine "Better Choice" recommendation
    // Rank by Suitability Score desc, INR Stars desc, then least HFSS flags
    const validProducts = compared.filter(p => p.evaluation && !p.evaluation.is_incomplete);
    const poolToRank = validProducts.length > 0 ? validProducts : compared;

    const sorted = [...poolToRank].sort((a, b) => {
      const scoreA = a.evaluation.score || 0;
      const scoreB = b.evaluation.score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.evaluation.inr.inr_stars || 0) - (a.evaluation.inr.inr_stars || 0);
    });

    const bestProduct = sorted[0];
    const comparisonNotes = [];

    // Comparative explanations
    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      const diffNotes = [];

      const sugarDiff = (other.evaluation.nutrients.sugar?.energy_pct || 0) - (bestProduct.evaluation.nutrients.sugar?.energy_pct || 0);
      if (sugarDiff > 5) {
        diffNotes.push(`${sugarDiff.toFixed(0)}% lower sugar contribution`);
      }

      const satFatDiff = (other.evaluation.nutrients.saturated_fat?.energy_pct || 0) - (bestProduct.evaluation.nutrients.saturated_fat?.energy_pct || 0);
      if (satFatDiff > 5) {
        diffNotes.push(`${satFatDiff.toFixed(0)}% lower saturated fat calories`);
      }

      const sodiumDiff = (other.evaluation.nutrients.sodium?.ratio_mg_per_kcal || 0) - (bestProduct.evaluation.nutrients.sodium?.ratio_mg_per_kcal || 0);
      if (sodiumDiff > 0.3) {
        diffNotes.push(`significantly lower sodium density`);
      }

      if (other.evaluation.hfss.is_hfss && !bestProduct.evaluation.hfss.is_hfss) {
        diffNotes.push(`avoids the draft HFSS red-flag triggered by ${other.name}`);
      }

      if (bestProduct.evaluation.additives.length < other.evaluation.additives.length) {
        diffNotes.push(`fewer synthetic food additives`);
      }

      comparisonNotes.push({
        comparison: `${bestProduct.name} vs ${other.name}`,
        advantages: diffNotes.length > 0 ? diffNotes : ['Superior overall nutritional balance and draft FSSAI profile']
      });
    }

    res.json({
      success: true,
      compared_products: compared,
      better_choice: {
        winner_id: bestProduct.id,
        winner_name: bestProduct.name,
        score: bestProduct.evaluation.score || 0,
        inr_stars: bestProduct.evaluation.inr.inr_stars || 0,
        summary: `${bestProduct.name} is recommended as the nutritionally superior option in this comparison.`,
        key_reasons: comparisonNotes
      }
    });
  } catch (err) {
    console.error('Error during product comparison:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Label Lens server running on http://localhost:${PORT}`);
});
