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

// 4. Optical Character Recognition (OCR) / Vision on Image
app.post('/api/analyze-image', upload.single('label_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    const requestedEngine = (req.body.engine || 'tesseract').toLowerCase();
    console.log(`Processing image: ${req.file.originalname} (${req.file.size} bytes), Engine: ${requestedEngine}`);

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

      const mimeType = req.file.mimetype || 'image/jpeg';
      const prompt = `You are an expert food safety, nutrition, and regulatory compliance analyst specializing in FSSAI (Food Safety and Standards Authority of India) food labeling regulations.
Analyze this food product packaging photograph and extract the nutritional values and complete ingredients list.

CRITICAL INSTRUCTIONS:
1. Standardize all nutritional values to the "per 100g" (or "per 100ml" for liquids/dairy/beverages) basis as required by FSSAI.
2. If values on the packaging are presented per serving (e.g. per 30g), mathematically convert them to per 100g or per 100ml. If serving size is not indicated, state the basis in serving_size.
3. If energy is not explicitly printed or is 0, estimate it using the 4-4-9 Atwater factor: (Protein * 4) + (Carbohydrate * 4) + (Fat * 9).
4. If only salt is reported, convert to sodium: sodium_mg = salt_g * 400.
5. Extract the entire ingredients text verbatim from the package if present.
6. Provide numeric numbers for all nutrient fields (use 0 or null if not mentioned).`;

      try {
        const candidateModels = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
        let response = null;
        let activeModel = 'gemini-3.7-flash';
        let lastErr = null;

        for (const modelCandidate of candidateModels) {
          try {
            console.log(`Attempting AI Vision generation with model: ${modelCandidate}...`);
            response = await ai.models.generateContent({
              model: modelCandidate,
              contents: [
                {
                  inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: mimeType
                  }
                },
                prompt
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
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

        // Atwater energy estimation fallback if zero or missing
        if ((!extracted.energy_kcal || extracted.energy_kcal === 0) && (extracted.protein_g || extracted.carbohydrate_g || extracted.total_fat_g)) {
          extracted.energy_kcal = Math.round((extracted.protein_g || 0) * 4 + (extracted.carbohydrate_g || 0) * 4 + (extracted.total_fat_g || 0) * 9);
        }

        const evaluation = evaluateFoodProduct(extracted);

        return res.json({
          success: true,
          engine_used: 'gemini',
          model: activeModel,
          product_name: extracted.product_name || req.file.originalname.replace(/\.[^/.]+$/, ''),
          brand: extracted.brand || 'Detected Brand',
          parsed_nutrients: extracted,
          raw_text: response.text,
          evaluation
        });
      } catch (aiErr) {
        console.error('AI Vision processing error:', aiErr);
        return res.status(500).json({
          success: false,
          error: `AI Vision processing error: ${aiErr.message}. You can disable the AI Vision toggle to use local offline OCR.`
        });
      }
    }

    // --- ENGINE 2: Local Offline Sharp + Tesseract OCR Pipeline (Toggle OFF) ---
    const metadata = await sharp(req.file.buffer).metadata();
    const targetWidth = Math.max(1600, Math.min(2600, (metadata.width || 800) * 2.5));

    const worker = await createWorker('eng');

    const recognizeAtAngle = async (angle) => {
      const buffer = await sharp(req.file.buffer)
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

    // 2. If weak detection (< 2 keywords), test 270° (sideways vertical bar) and 90°
    if (best.score < 2) {
      console.log('Low keyword detection at 0°. Testing 270° orientation...');
      const r270 = await recognizeAtAngle(270);
      if (r270.score > best.score) {
        best = r270;
      }
      if (best.score < 2) {
        console.log('Testing 90° orientation...');
        const r90 = await recognizeAtAngle(90);
        if (r90.score > best.score) {
          best = r90;
        }
      }
    }

    // 3. High-contrast linear pass at the selected orientation to capture condensed table fonts & glare regions
    try {
      const hcBuf = await sharp(req.file.buffer)
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

    // 4. Red-channel pass (turns blue/cyan ink on white packaging deep black to pierce glare)
    try {
      const redBuf = await sharp(req.file.buffer)
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

    console.log(`Selected orientation: ${best.angle}° with keyword score: ${best.score}`);

    // Parse the extracted text
    const parsedNutrients = parseNutritionText(best.text);
    const evaluation = evaluateFoodProduct(parsedNutrients);

    res.json({
      success: true,
      engine_used: 'tesseract',
      raw_ocr_text: best.text,
      orientation_angle: best.angle,
      confidence: best.confidence,
      parsed_nutrients: parsedNutrients,
      evaluation
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
