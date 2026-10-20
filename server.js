import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

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

// 4. Optical Character Recognition (OCR) on Image with Multi-Angle Auto-Orientation
app.post('/api/analyze-image', upload.single('label_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    console.log(`Processing OCR for file: ${req.file.originalname} (${req.file.size} bytes)`);

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

    await worker.terminate();

    console.log(`Selected orientation: ${best.angle}° with keyword score: ${best.score}`);

    // Parse the extracted text
    const parsedNutrients = parseNutritionText(best.text);
    const evaluation = evaluateFoodProduct(parsedNutrients);

    res.json({
      success: true,
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
