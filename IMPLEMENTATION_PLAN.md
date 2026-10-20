# Label Lens: Implementation Plan & Architecture Specification

**Project:** Label Lens — AI-Enabled Nutrition Label Analysis & Comparison Platform for Packaged Food Products  
**Dissertation:** M.Tech in Software Engineering (Product Management Specialisation), BITS Pilani  
**Date:** October 2026  
**Status:** Plan Approved for Execution  

---

## 1. Executive Summary & Objective

This document outlines the end-to-end technical plan for building **Label Lens**, an explainable, consumer-facing Progressive Web Application (PWA). The platform enables Indian consumers to scan or paste packaged food nutrition panels and receive instantaneous, plain-language health verdicts, allergen alerts, regulatory compliance checks, and side-by-side product comparisons.

### Evaluator Requirements Addressed
1. **Live Demonstration Readiness:** Foolproof PWA with 1-click pre-loaded product presets ensuring zero live-demo failures during defense.
2. **Product Comparison with Visualization:** Interactive side-by-side comparison of 2–3 products with dynamic visual charts (nutrient breakdown, traffic lights, and "Better Choice" recommendations).
3. **Explicit AI Element (Explainable AI / Expert System):** Transparent, auditable reasoning pipeline (`Perception → Knowledge Base → Inference Engine → XAI Reasoning Trace`) eliminating black-box hallucinations.
4. **Dataset & ML Benchmark:** Curated 50-product Indian packaged food dataset (derived from Open Food Facts India and physical packaging) with an ML benchmark script comparing machine learning classifiers against the deterministic regulatory rule engine.

---

## 2. System Architecture & Tech Stack

```
                                    +------------------------------------------------+
                                    |                User Interface                  |
                                    |   (Mobile-First PWA, Tailwind/CSS, Chart.js)   |
                                    +-----------------------+------------------------+
                                                            |
                                      [Image Upload / Camera / Pasted Text]
                                                            |
                                                            v
+-------------------------------------------------------------------------------------------------------------------+
| Node.js / Express Backend Engine                                                                                  |
|                                                                                                                   |
|  +---------------------------+       +-------------------------------+       +---------------------------------+  |
|  |     Extraction Layer      |       |      Inference Engine         |       |        Output Formatter         |  |
|  |  • Tesseract.js OCR       | ----> |  • Evaluates Rule Sets A, B, C| ----> |  • Heuristic Score (1 to 5)    |  |
|  |  • Heuristic Text Parser  |       |  • FSSAI Draft INR Star Calc  |       |  • FSSAI INR Star Rating        |  |
|  |  • Unit Normalization     |       |  • Explainability Generator   |       |  • Visual Traffic Lights        |  |
|  +---------------------------+       +---------------+---------------+       |  • XAI Audit Trail (Trace)      |  |
|                                                      ^                       +---------------------------------+  |
|                                                      |                                                            |
|                                      +---------------+---------------+                                            |
|                                      |   Modular Knowledge Bases     |                                            |
|                                      |   (JSON Regulatory Rules)     |                                            |
|                                      |  • fssai-hfss-rules.json      |                                            |
|                                      |  • indian-allergens.json      |                                            |
|                                      |  • additives-watchlist.json   |                                            |
|                                      +-------------------------------+                                            |
+-------------------------------------------------------------------------------------------------------------------+
                                                            |
                                     +----------------------+-----------------------+
                                     |                                              |
                                     v                                              v
                      +-----------------------------+                +------------------------------+
                      | Side-by-Side Comparison UI  |                | Offline ML Benchmark (Python)|
                      | (Chart.js Bar & Radar Charts|                | (Scikit-Learn HFSS Classifier|
                      |  Nutrient Delta Analysis)   |                |  vs. Deterministic Rules)    |
                      +-----------------------------+                +------------------------------+
```

### Technology Decisions
* **Frontend:** Vanilla HTML5, Modern CSS / Tailwind (compiled/CDN), JavaScript (ES Modules). Lightweight, ultra-fast load times, fully responsive for mobile screens, installable as a PWA.
* **Visualization:** Chart.js for responsive nutrient bar and radar comparison charts.
* **Backend:** Node.js with Express.js for clean REST APIs.
* **OCR Engine:** Tesseract.js (runs locally, zero API costs, zero data sent to external cloud APIs, preserving user privacy).
* **Knowledge Base:** Decoupled JSON schemas for FSSAI thresholds, Indian allergen names, and INS additive lists (allowing rapid regulatory updates without touching code).
* **ML Evaluation Module:** Python (`scikit-learn`, `pandas`, `scipy`) for generating Chapter 7 evaluation metrics, confusion matrices, and Spearman rank correlations.

---

## 3. Directory & File Structure

```
label-lens/
├── package.json
├── server.js                          # Express server & API routes
├── data/
│   ├── fssai-hfss-rules.json          # FSSAI 2022 draft % of energy & sodium thresholds
│   ├── indian-allergens.json          # 9 allergen families + Indian ingredient terms
│   ├── additives-watchlist.json       # Curated INS additives & health notes
│   ├── presets.json                   # Pre-loaded popular Indian packaged foods (demo)
│   └── benchmark_50_products.json     # Ground truth dataset for evaluation
├── engine/
│   ├── parser.js                      # Regex & fuzzy parser for OCR nutrition text
│   ├── rules-engine.js                # Core knowledge-based inference & scoring engine
│   └── inr-calculator.js              # Official FSSAI Draft Indian Nutrition Rating formula
├── public/
│   ├── index.html                     # Main application single-page interface
│   ├── css/
│   │   └── styles.css                 # Clean, modern, accessible design system
│   ├── js/
│   │   ├── app.js                     # Core UI logic, state management, tab switching
│   │   ├── ocr-handler.js             # Tesseract.js client/server coordination
│   │   ├── compare-view.js            # Comparison module & Chart.js rendering
│   │   └── presets-handler.js         # 1-click live demo loader
│   ├── manifest.json                  # PWA manifest
│   └── icons/                         # App icons
├── scripts/
│   ├── ml_benchmark.py                # Evaluator ML model: Scikit-learn vs Rule Engine
│   └── evaluate_metrics.py            # Generates Chapter 7 tables (Accuracy, Recall, Spearman)
├── IMPLEMENTATION_PLAN.md             # This document
└── README.md                          # Quickstart & defense presentation guide
```

---

## 4. Detailed Implementation Phases

### Phase 1: Environment Setup & Core Server
* Initialize Node.js project (`package.json`).
* Install dependencies: `express`, `tesseract.js`, `cors`, `multer` (for image uploads).
* Configure Express server (`server.js`) with static asset serving and structured REST endpoints:
  * `POST /api/analyze-text`: Accepts pasted or raw OCR text, parses values, returns complete analysis.
  * `POST /api/analyze-image`: Handles image upload, runs OCR, parses, and analyzes.
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
   * Flagging common INS numbers (e.g., INS 102 Tartrazine, INS 110 Sunset Yellow, INS 150d Caramel IV, INS 211 Sodium Benzoate, INS 950 Acesulfame K, INS 951 Aspartame, INS 955 Sucralose, INS 621 MSG).
4. **Scoring Logic:**
   * Baseline Score: $5.0$.
   * Deductions: $-1.0$ for each HFSS nutrient exceeded; $-0.5$ for borderline nutrients; $-0.5$ if overall HFSS; $-0.5$ per flagged additive (max $-1.5$). Floor at $1.0$.
5. **Indian Nutrition Rating (INR) Calculator:**
   * Implementation of the draft FSSAI scoring points (0.5 to 5 stars) based on baseline negative points (energy, sugar, sat fat, sodium) vs positive points (fruit/veg/nuts, protein, fibre).

### Phase 3: Robust Nutrition Label Text Parser
* Regex and natural language rules tailored to Indian packaging variations:
  * Energy / Calories: `kcal`, `kJ`, `Energy`, `Calories`.
  * Total & Added Sugars: `Total Sugars`, `Added Sugars`, `Sucrose`.
  * Fats: `Total Fat`, `Saturated Fat`, `Sat Fat`, `Trans Fat`.
  * Sodium & Salt: `Sodium`, `Salt` (automatic conversion: $\text{Salt} \div 2.5 = \text{Sodium}$).
  * Protein, Dietary Fibre.
  * Serving size vs. Per 100g/ml normalization.
  * Safe fallback: Unreadable/missing fields explicitly marked as `"Unknown / Not Declared"`, never coerced to zero.

### Phase 4: Single Product UI & Explainable AI (XAI) Audit Trail
* Clean, responsive UI with:
  * Tabbed input: **Upload Photo / Camera**, **Paste Label Text**, and **Select Demo Preset**.
  * Visual Health Verdict Card: Large Suitability Score badge, HFSS warning alert, and nutrient traffic lights.
  * **The "Reasoning Trace" (Audit Trail):**
    * Expandable step-by-step card showing:
      * `[Input] Total Sugar: 26g (104 kcal) = 21.6% of calories`
      * `[Rule Applied] FSSAI HFSS Draft Threshold: >10% of total energy`
      * `[Result] Tripped HFSS threshold. Deduction: -1.0 pt.`
  * Clear disclaimers: Informational prototype based on FSSAI 2022 draft regulations; not medical advice.

### Phase 5: Side-by-Side Product Comparison & Visualization
* Multi-product comparison workspace (compare 2 or 3 products).
* Visual charts powered by Chart.js:
  * Grouped horizontal bar charts comparing Energy (kcal), Sugar (% kcal), Saturated Fat (% kcal), and Sodium (mg/kcal).
  * Nutrient traffic-light grid for quick visual scanning.
  * Direct score comparison: Prototype Score vs FSSAI INR Stars.
  * **"Better Choice" Recommendation Engine:** Generates plain-English comparative verdict (e.g., *"Product B is the healthier choice: 65% less sugar, no saturated fat violation, and free from synthetic color INS 102"*).

### Phase 6: Live Defense Presentation Mode (1-Click Presets)
* Pre-loaded data for iconic Indian consumer products across diverse categories:
  1. *Britannia Good Day Butter Cookies* (High Sugar, High Saturated Fat - HFSS)
  2. *Sunfeast Farmlite Digestive* (Moderate Sugar, Fibre declared)
  3. *Maggi 2-Minute Masala Noodles* (High Sodium, High Saturated Fat - HFSS)
  4. *Yippee Mood Masala Noodles* (Comparison pairing for Maggi)
  5. *Kellogg's Corn Flakes vs Kellogg's Chocos* (High sugar comparison)
  6. *Lay's Classic Salted Potato Chips* (High Fat, High Sodium)
* Ensures instant demonstration with zero lag or lighting dependency during oral defense.

### Phase 7: Evaluator ML Benchmark & Academic Metrics (Chapter 7)
* Assemble `data/benchmark_50_products.json` containing 50 Indian packaged food products with verified ground-truth values.
* Create `scripts/ml_benchmark.py`:
  * Trains supervised classification models (Logistic Regression, Decision Tree, Random Forest) to predict binary HFSS status from nutrient features (`sugar_pct_energy`, `sat_fat_pct_energy`, `sodium_per_kcal`, `energy_kcal`).
  * Evaluates with cross-validation and generates:
    * Confusion Matrix, Accuracy, Precision, Recall, and F1-score.
  * Compares ML performance against the Knowledge-Based Rule Engine.
  * Calculates Spearman rank correlation between the prototype heuristic score and the FSSAI INR star rating.
  * Outputs publication-ready markdown tables matching the mid-sem report's Table 7.1.

---

## 5. Success Criteria & Verification Checklist

| Area | Target / Verification Method |
| :--- | :--- |
| **PWA Usability** | Loads in $<2$ seconds on mobile and desktop; responsive layout. |
| **OCR Extraction** | Parses clear label images and pasted text into structured JSON with accurate field mappings. |
| **Rule Correctness** | Exact mathematical conformance with FSSAI 2022 Draft HFSS thresholds. |
| **Explainability** | Every deduction has a visible, readable plain-English explanation citing the rule. |
| **Comparison View** | Renders 2–3 products side-by-side with working Chart.js graphs and a comparative summary. |
| **Demo Presets** | 6 preloaded Indian products work instantly with zero errors. |
| **ML Benchmark** | Generates verified metrics on the 50-product benchmark matching Chapter 7 commitments. |

---

## 6. Execution Order

1. **Step 1:** Create project scaffolding, `package.json`, and directory structure.
2. **Step 2:** Author the regulatory JSON knowledge bases (`fssai-hfss-rules.json`, `indian-allergens.json`, `additives-watchlist.json`, `presets.json`).
3. **Step 3:** Implement the backend inference engine, parser, and INR calculator.
4. **Step 4:** Build the clean, responsive Frontend UI (Single Product View, Presets, XAI Reasoning Trace).
5. **Step 5:** Build the Comparison View with Chart.js visualization.
6. **Step 6:** Assemble the 50-product benchmark dataset and write the Python evaluation script (`ml_benchmark.py`).
7. **Step 7:** Run end-to-end tests and verify demo readiness.
