import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
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

// 3. Analyze Pasted or Form-based Text
app.post('/api/analyze-text', (req, res) => {
  try {
    const { text, manualNutrients } = req.body;

    let parsedNutrients = {};
    if (manualNutrients) {
      parsedNutrients = {
        ...manualNutrients,
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

// 4. Optical Character Recognition (OCR) on Image
app.post('/api/analyze-image', upload.single('label_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    console.log(`Processing OCR for file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Run Tesseract OCR on memory buffer
    const worker = await createWorker('eng');
    const ret = await worker.recognize(req.file.buffer);
    const ocrText = ret.data.text;
    await worker.terminate();

    // Parse the extracted text
    const parsedNutrients = parseNutritionText(ocrText);
    const evaluation = evaluateFoodProduct(parsedNutrients);

    res.json({
      success: true,
      raw_ocr_text: ocrText,
      confidence: ret.data.confidence,
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
      if (!evaluation) {
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
    const sorted = [...compared].sort((a, b) => {
      if (b.evaluation.score !== a.evaluation.score) {
        return b.evaluation.score - a.evaluation.score;
      }
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
        score: bestProduct.evaluation.score,
        inr_stars: bestProduct.evaluation.inr.inr_stars,
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
