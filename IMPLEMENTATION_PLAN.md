# Label Lens: Implementation Plan & Architecture Specification

**Project:** Label Lens — AI-Enabled Nutrition Label Analysis & Comparison Platform for Packaged Food Products  
**Dissertation:** M.Tech in Software Engineering (Product Management Specialisation), BITS Pilani  
**Candidate:** Shreya Sinha (2024HT01004)  
**Supervisor:** Aniket Dokania  
**Date:** October 2026  
**Status:** Completed & Live Verified (All Phases 1–8 Delivered)  

---

## 1. Executive Summary & Objective

This document outlines the end-to-end technical plan and architectural specification for **Label Lens**, an explainable, consumer-facing Progressive Web Application (PWA). The platform enables Indian consumers and regulatory researchers to scan, photograph, or paste packaged food nutrition panels and receive instantaneous, plain-language health verdicts, allergen alerts, statutory FSSAI compliance checks, side-by-side product comparisons, cumulative meal analytics, and an interactive toggle between deterministic regulatory rule engines and trained machine learning classifiers.

### Evaluator Requirements Addressed
1. **Live Demonstration Readiness:** Foolproof PWA with 1-click pre-loaded product presets ensuring zero live-demo failures during defense.
2. **Product Comparison with Visualization:** Interactive side-by-side comparison of 2–3 products with dynamic visual charts (grouped nutrient breakdown, traffic lights, and "Better Choice" recommendations).
3. **Explicit AI Element (Explainable AI / Expert System):** Transparent, auditable reasoning pipeline (`Perception → Knowledge Base → Inference Engine → XAI Reasoning Trace`) eliminating black-box hallucinations.
4. **Interactive Engine Toggle (Rule Engine vs. ML Classifier):** A live UI toggle allowing evaluators to compare the statutory 100% deterministic FSSAI 2022 draft rule engine against an in-browser supervised machine learning classifier (Logistic Regression & Decision Tree, $F1 = 0.988$).
5. **Two-Stage Neurosymbolic Architecture:** Clear academic justification explaining why food labels require a two-stage pipeline (Stage 1: AI Vision perception $\to$ Stage 2: Compliance/ML reasoning) rather than brittle, legally inadmissible end-to-end raw pixel CNNs.
6. **Cumulative Meal & Combo Analysis:** Multi-product detection in a single image (e.g. Milk + Bread in one photo) and multi-image batch upload for cumulative diet intake evaluation.
7. **Dataset & ML Benchmark:** Curated 50-product Indian packaged food dataset (`data/benchmark_50_products.json`) with an offline Python ML benchmark script (`scripts/ml_benchmark.py`) and live JavaScript classifier (`engine/ml-classifier.js`).

---

## 2. System Architecture & Tech Stack

```
                              [ User Input Layer ]
                 ┌──────────────────────────────────────────────┐
                 │  • Single Label Photo (AI Vision / OCR)      │
                 │  • Multi-Product Single Photo (e.g. Milk+Bun)│
                 │  • Multi-Image Batch Upload (1..N photos)    │
                 │  • Pasted Text / 1-Click Demo Presets        │
                 └──────────────────────┬───────────────────────┘
                                        │
                                        ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │              STAGE 1: Vision Perception & Extraction Layer             │
    │   • Multimodal AI Vision (Gemini 2.5 Flash via config/.env API key)    │
    │   • Fallback Local OCR (Sharp pre-processing + Regex/Tesseract)        │
    │   • Unit Normalization (per 100g, salt-to-sodium, serving size)        │
    └───────────────────────────────────┬────────────────────────────────────┘
                                        │ Extracted Normalized Nutrients
                                        ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │             STAGE 2: Multi-Product & Cumulative Orchestration          │
    │   • engine/cumulative.js (Weights pooling, daily intake sums)          │
    └──────────────────┬─────────────────────────────────┬───────────────────┘
                       │ Single Product                  │ Cumulative Combo
                       ▼                                 ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │           INTERACTIVE EVALUATION ENGINE TOGGLE (Live UI Switcher)      │
    └──────────────┬───────────────────────────────────────────┬─────────────┘
                   │ Toggle: [ ⚖️ Rule Engine ]                 │ Toggle: [ 🤖 ML Classifier ]
                   ▼                                           ▼
    ┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
    │  FSSAI 2022 XAI Rule Engine          │   │  Supervised ML Classifier            │
    │  (engine/rules-engine.js)            │   │  (engine/ml-classifier.js)           │
    ├──────────────────────────────────────┤   ├──────────────────────────────────────┤
    │ • Schedule V Draft Point System      │   │ • 9-dimensional Feature Vector:      │
    │ • 100% Deterministic Statutory Rules │   │   x = [sugar%, sat_fat%, sodium_dens,│
    │ • Total Sugar <= 10% kcal            │   │        energy, sugars, sat_fat, ...] │
    │ • Saturated Fat <= 10% kcal          │   │ • Trained Model Weights (w0 + Σwi xi)│
    │ • Sodium <= 1.0 mg/kcal              │   │ • Sigmoid: P(HFSS) = 1 / (1 + e^-z)  │
    │ • FSSAI INR Star Rating (0.5 to 5.0) │   │ • Log-Odds Feature Sensitivity (Risk │
    │ • Step-by-Step Plain-English Trace   │   │   Push vs Protective Buffer)         │
    │ • Statutory Category Exemptions      │   │ • Decision Tree Cross-Check Split    │
    │   (e.g., Dairy lactose exemption)    │   │ • Empirical Risk Level & Star Pred   │
    └──────────────────┬───────────────────┘   └──────────────────┬───────────────────┘
                       │                                          │
                       └───────────────────┬──────────────────────┘
                                           │
                                           ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                    Front-End Presentation & XAI UI                     │
    │   • Dual Engine Views: #rule-engine-view vs. #ml-engine-view           │
    │   • Cumulative Combo Banner & Multi-Product Table                      │
    │   • Visual Health Verdict & Traffic Light Badges                       │
    │   • Side-by-Side Product Comparison (Chart.js Bar & Radar Charts)      │
    │   • 1-Click Iconic Demo Presets (Britannia, Maggi, Amul, Farmlite)     │
    │   • Audit Trail Reasoning Trace & Contrast Matrix                      │
    └────────────────────────────────────────────────────────────────────────┘
```

### Technology Decisions
* **Frontend:** Vanilla HTML5, Modern CSS / Tailwind, JavaScript (ES Modules). Zero heavy framework overhead, instant load times, responsive across mobile and desktop, PWA-ready.
* **Visualization:** Chart.js for responsive grouped nutrient comparison charts, radar charts, and ML sensitivity bars.
* **Backend:** Node.js with Express.js for clean, modular REST APIs.
* **Perception Layer:** Two-tier hybrid architecture:
  1. Multimodal AI Vision (`@google/genai` Gemini 2.5 Flash) managed via backend `.env` configuration for state-of-the-art multi-product label segmentation and zero-shot table extraction.
  2. Local heuristic OCR and regex parsing for fallback, offline, and zero-cost operation.
* **Knowledge Base:** Decoupled JSON schemas (`fssai-hfss-rules.json`, `indian-allergens.json`, `additives-watchlist.json`, `presets.json`).
* **ML Evaluation Module:**
  1. Python (`scripts/ml_benchmark.py`, `scripts/evaluate_metrics.py`) using `scikit-learn` and `pandas` for dissertation Chapter 7 empirical verification.
  2. JavaScript (`engine/ml-classifier.js`) directly embedded in the runtime for real-time inference in the web application.

---

## 3. Directory & File Structure

```
label-lens/
├── package.json
├── server.js                          # Express server & API routes (OCR, AI Vision, ML, Combo)
├── .env.example                       # Template for API keys and engine toggles
├── data/
│   ├── fssai-hfss-rules.json          # FSSAI 2022 draft % of energy & sodium thresholds
│   ├── indian-allergens.json          # 9 allergen families + Indian ingredient terms (Maida, Besan, etc.)
│   ├── additives-watchlist.json       # Curated INS additives & health notes (Tartrazine, MSG, etc.)
│   ├── presets.json                   # Pre-loaded popular Indian packaged foods (demo)
│   └── benchmark_50_products.json     # Ground truth dataset for evaluation (50 products)
├── engine/
│   ├── parser.js                      # Regex & fuzzy parser for OCR nutrition text
│   ├── rules-engine.js                # Core knowledge-based inference & scoring engine (XAI)
│   ├── inr-calculator.js              # Official FSSAI Draft Indian Nutrition Rating formula
│   ├── ml-classifier.js               # Supervised Logistic Regression & Decision Tree ML Classifier
│   └── cumulative.js                  # Multi-product pooling & cumulative combo meal engine
├── public/
│   ├── index.html                     # Single-page interface with Rule Engine vs ML toggle
│   ├── css/
│   │   └── styles.css                 # Clean, modern, accessible design system
│   ├── js/
│   │   ├── app.js                     # Core UI logic, state management, engine switcher, combo UI
│   │   ├── ocr-handler.js             # Image upload, AI Vision, and OCR coordination
│   │   ├── compare-view.js            # Comparison module & Chart.js rendering
│   │   └── presets-handler.js         # 1-click live demo loader
│   ├── manifest.json                  # PWA manifest
│   └── icons/                         # App icons
├── scripts/
│   ├── ml_benchmark.py                # Python benchmark: Scikit-learn vs Rule Engine
│   └── evaluate_metrics.py            # Generates Chapter 7 tables (Accuracy, Recall, Spearman)
├── IMPLEMENTATION_PLAN.md             # This document
└── README.md                          # Quickstart, defense presentation guide & academic rationale
```

---

## 4. Detailed Implementation Phases

### Phase 1: Environment Setup & Core Server
* Initialize Node.js project (`package.json`).
* Install dependencies: `express`, `cors`, `multer` (for single & multi-file uploads), `@google/genai`, `dotenv`.
* Configure Express server (`server.js`) with static asset serving and structured REST endpoints:
  * `POST /api/analyze-text`: Accepts pasted or raw text, parses values, returns complete analysis.
  * `POST /api/analyze-image`: Handles single image upload (AI Vision or local OCR), supports multi-product detection within a single image.
  * `POST /api/analyze-images`: Handles multi-image batch uploads and returns pooled cumulative meal analysis.
  * `POST /api/evaluate-ml`: Dedicated endpoint to run the ML classifier directly on extracted nutrients.
  * `GET /api/presets`: Returns list of curated products for instant demo.
  * `POST /api/compare`: Accepts multiple product IDs/payloads and returns comparison metrics.

### Phase 2: Regulatory Knowledge Base & Inference Engine
1. **Rule Set A (FSSAI 2022 Draft HFSS Criteria):**
   * Total Sugar: Energy contribution must be $\le 10\%$ of total calories ($4\text{ kcal/g}$).
   * Saturated Fat: Energy contribution must be $\le 10\%$ of total calories ($9\text{ kcal/g}$).
   * Sodium: Ratio must be $\le 1.0\text{ mg}$ sodium per $1.0\text{ kcal}$.
   * Overall HFSS Flag: Tripped if any one of the three thresholds is exceeded.
2. **Rule Set B (Indian Allergen Dictionary):**
   * Curated mapping across 9 families (Milk, Gluten/Wheat, Peanut, Tree Nuts, Soy, Egg, Fish, Shellfish, Sesame).
   * Contextual Indian synonyms: *Maida, Sooji, Atta, Besan, Ghee, Paneer, Groundnut, Til, Hing (wheat carrier)*.
3. **Rule Set C (Additive & Preservative Watchlist):**
   * Flagging common INS numbers (INS 102 Tartrazine, INS 110 Sunset Yellow, INS 150d Caramel IV, INS 211 Sodium Benzoate, INS 950 Acesulfame K, INS 951 Aspartame, INS 955 Sucralose, INS 621 MSG).
4. **Scoring Logic:**
   * Baseline Score: $5.0$. Deductions: $-1.0$ for each HFSS nutrient exceeded; $-0.5$ for borderline nutrients; $-0.5$ if overall HFSS; $-0.5$ per flagged additive. Floor at $1.0$.
5. **Indian Nutrition Rating (INR) Calculator:**
   * Implementation of the draft FSSAI scoring points (0.5 to 5 stars) based on baseline negative points (energy, sugar, sat fat, sodium) vs positive points (fruit/veg/nuts, protein, fibre).

### Phase 3: Robust Nutrition Label Perception (Two-Stage Hybrid)
* **Stage 1 (Vision Perception):**
  * Multimodal AI Vision: Extracts full nutritional facts, ingredients, serving sizes, and detects whether multiple products appear in a single photo.
  * Local Heuristic Parser fallback: Regex and natural language rules tailored to Indian packaging variations (Per 100g vs. per serving, salt-to-sodium conversion).
  * Safe fallback: Unreadable/missing fields explicitly marked as `"Unknown / Not Declared"`, never coerced to zero.
* **Stage 2 (Reasoning & Evaluation):**
  * Handled cleanly by either the Deterministic Rule Engine or the Supervised ML Classifier based on user selection.

### Phase 4: Single Product UI & Explainable AI (XAI) Audit Trail
* Clean, responsive UI with:
  * Tabbed input: **Upload Photo / Camera**, **Paste Label Text**, and **Select Demo Preset**.
  * Visual Health Verdict Card: Large Suitability Score badge, HFSS warning alert, and nutrient traffic lights.
  * **The "Reasoning Trace" (Audit Trail):** Step-by-step card showing raw input, regulatory rule applied, point deductions, and legal citations.

### Phase 5: Side-by-Side Product Comparison & Visualization
* Multi-product comparison workspace (compare 2 or 3 products).
* Visual charts powered by Chart.js:
  * Grouped horizontal bar charts comparing Energy (kcal), Sugar (% kcal), Saturated Fat (% kcal), and Sodium (mg/kcal).
  * Nutrient traffic-light grid for quick visual scanning.
  * **"Better Choice" Recommendation Engine:** Plain-English comparative verdict explaining why one product is superior.

### Phase 6: Live Defense Presentation Mode (1-Click Presets)
* Pre-loaded data for iconic Indian consumer products across diverse categories:
  1. *Britannia Good Day Butter Cookies* (High Sugar, High Saturated Fat - HFSS)
  2. *Sunfeast Farmlite Digestive* (Moderate Sugar, Fibre declared)
  3. *Maggi 2-Minute Masala Noodles* (High Sodium, High Saturated Fat - HFSS)
  4. *Yippee Mood Masala Noodles* (Comparison pairing for Maggi)
  5. *Kellogg's Corn Flakes vs Kellogg's Chocos* (High sugar comparison)
  6. *Lay's Classic Salted Potato Chips* (High Fat, High Sodium)
  7. *Amul Taaza Homogenised Toned Milk* (Dairy exemption test case)

### Phase 7: Supervised ML Classifier & Interactive Live Toggle
* **Engine Implementation (`engine/ml-classifier.js`):**
  * 9-dimensional mathematical feature space $\mathbf{x}$.
  * Trained Logistic Regression weights ($w_0 + \sum w_i x_i$) and Sigmoid probability $P(\text{HFSS}) = \frac{1}{1 + e^{-z}}$.
  * Log-odds feature sensitivity breakdown: Shows which nutrients pushed the product toward HFSS risk (`⚠️ Risk Push`) vs buffered it (`✓ Protective Factor`).
  * Decision tree cross-check rules.
* **Live UI Engine Switcher:**
  * Mode selector bar in the UI: `[ ⚖️ Rule Engine (XAI) ]` vs `[ 🤖 ML Classifier (Trained) ]`.
  * Dedicated `#ml-engine-view` displaying Sigmoid confidence meter, risk level, predicted INR stars, feature sensitivity impact table, and academic contrast matrix.
* **Academic Evaluation & Confounder Discovery:**
  * Documents why raw pixel CNNs are brittle and legally inadmissible for statutory food regulations.
  * Documents the **plain milk lactose confounder**: Milk contains natural lactose ($~32.5\%$ sugar calories). The ML classifier flags plain milk as HFSS ($P = 0.9997$), whereas the Rule Engine correctly applies food category statutory exemptions (dairy non-added sugars), proving the necessity of symbolic rule engines in public health.

### Phase 8: Cumulative Meal & Combo Analytics
* **Engine Implementation (`engine/cumulative.js`):**
  * Enables cumulative dietary intake analysis across multiple food items consumed together.
  * Supports two input modalities:
    1. **Single photo containing multiple products** (e.g. Milk packet and Bread loaf placed side by side).
    2. **Multi-image batch upload** (uploading photo 1: Milk, photo 2: Bread, photo 3: Butter).
  * Automatically calculates total calories, cumulative sugars, saturated fats, sodium, dietary fibre, and protein.
  * Computes pooled energy ratios and determines whether the combined meal breaches daily limits or trips HFSS thresholds.
  * Renders an interactive Cumulative Combo Meal Card with per-product breakdowns, item badges, and cumulative nutritional warnings.

---

## 5. Success Criteria & Verification Checklist

| Area | Target / Verification Method | Status |
| :--- | :--- | :--- |
| **PWA Usability** | Loads in $<2$ seconds on mobile and desktop; responsive layout. | ✅ Completed |
| **OCR & AI Vision** | Parses clear label images and pasted text into structured JSON with accurate field mappings; backend `.env` configuration. | ✅ Completed |
| **Rule Correctness** | Exact mathematical conformance with FSSAI 2022 Draft HFSS thresholds. | ✅ Completed |
| **Explainability (XAI)** | Every deduction has a visible, readable plain-English explanation citing the statutory rule. | ✅ Completed |
| **Comparison View** | Renders 2–3 products side-by-side with working Chart.js graphs and a comparative summary. | ✅ Completed |
| **Demo Presets** | 7 preloaded Indian products work instantly with zero errors. | ✅ Completed |
| **ML Classifier** | Supervised model with 9 features, Sigmoid probability, log-odds feature sensitivity, and Decision Tree cross-check. | ✅ Completed |
| **Live UI Engine Toggle**| Interactive switch between Rule Engine (XAI) and ML Classifier with live UI updates. | ✅ Completed |
| **Cumulative Combo Analysis** | Single image multi-product detection and multi-image batch upload with pooled nutritional analytics. | ✅ Completed |
| **Academic Defense Docs**| Complete dissertation justification, CNN vs Neurosymbolic comparison, and milk confounder analysis. | ✅ Completed |

---

## 6. Execution & Verification Log

1. **Step 1 (Scaffolding):** Express server, static middleware, and REST routes initialized.
2. **Step 2 (Knowledge Base):** Authored `fssai-hfss-rules.json`, `indian-allergens.json`, `additives-watchlist.json`, and `presets.json`.
3. **Step 3 (Inference Engine):** Implemented `engine/parser.js`, `engine/rules-engine.js`, and `engine/inr-calculator.js`.
4. **Step 4 (Frontend UI & XAI):** Built responsive UI with tabbed input, health verdict card, and expandable XAI Reasoning Trace.
5. **Step 5 (Product Comparison):** Implemented multi-product comparison workspace with Chart.js bar and radar visualizations.
6. **Step 6 (Benchmark Dataset):** Assembled `data/benchmark_50_products.json` and Python evaluation script `scripts/ml_benchmark.py`.
7. **Step 7 (AI Vision Integration):** Added Gemini 2.5 Flash multimodal vision layer with backend `.env` configuration and generic "AI Vision" UI branding.
8. **Step 8 (Cumulative Combo Engine):** Added `engine/cumulative.js`, single-photo multi-product support, and multi-file batch upload support.
9. **Step 9 (ML Classifier & Live Toggle):** Added `engine/ml-classifier.js`, live interactive UI toggle between Rule Engine and ML Classifier, feature sensitivity breakdown, and academic contrast matrix.
10. **Step 10 (Documentation & Academic Defense):** Updated `README.md` and `IMPLEMENTATION_PLAN.md` with full academic specifications, math formulations, and defense FAQs.
