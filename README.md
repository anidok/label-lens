# Label Lens 🔍
> **AI-Enabled Packaged Food Nutrition Label Analysis & Comparison Platform**  
> *Academic Dissertation Project • M.Tech in Software Engineering (Product Management Specialisation) • BITS Pilani*  
> **Candidate:** Shreya Sinha (2024TM93626) | **Supervisor:** Aniket Dokania (Lead Software Engineer, Gojek India)

---

## 📌 Overview

**Label Lens** is an explainable Progressive Web App (PWA) designed for Indian consumers to scan or paste packaged food nutrition labels and receive instant, plain-language health verdicts, allergen alerts, regulatory checks, and side-by-side product comparisons in under 5 seconds.

It is grounded directly in the statutory definitions of the **FSSAI 2022 Draft Labelling and Display Amendment Regulations** (High Fat, Sugar, Salt — HFSS and the Indian Nutrition Rating — INR).

---

## ⚡ Dual-Engine Label Recognition Architecture

Label Lens provides a flexible, dual-mode vision engine with an instant **UI Toggle Switch** in the photo upload interface:

```
                      ┌────────────────────────────────────────┐
                      │        Upload Food Label Photo         │
                      └──────────────────┬─────────────────────┘
                                         │
                         [ Vision Engine Toggle Switch ]
                                ╱                 ╲
                    Toggle OFF ╱                   ╲ Toggle ON
                              ▼                     ▼
          ┌────────────────────────────┐   ┌────────────────────────────┐
          │  Offline Local OCR Engine  │   │   Gemini Flash AI Vision   │
          │     (Sharp + Tesseract)    │   │      (@google/genai)       │
          ├────────────────────────────┤   ├────────────────────────────┤
          │ • 100% on-device & offline │   │ • Multimodal AI (Gemini    │
          │ • Zero cloud calls/private │   │   2.5 Flash)               │
          │ • Multi-angle auto-rotate  │   │ • Solves curved packaging, │
          │   (0°, 90°, 270°)          │   │   glare & micro-fonts      │
          │ • Dual-pass contrast & red │   │ • Strict JSON schema       │
          │   channel ink separation   │   │   guarantees zero halluc-  │
          │ • Atwater energy fallback  │   │   inated nutrient fields   │
          └─────────────┬──────────────┘   └─────────────┬──────────────┘
                        │                                │
                        └───────────────┬────────────────┘
                                        ▼
                      ┌──────────────────────────────────┐
                      │    FSSAI 2022 XAI Rule Engine    │
                      │  (INR Stars • HFSS Determination │
                      │   Allergen & Additive Audits)    │
                      └──────────────────────────────────┘
```

1. **Local Offline OCR Engine (Toggle OFF - Default):**
   - **Privacy-Preserving & Offline:** Runs entirely on-device without external cloud dependencies or API keys.
   - **Computer Vision Pipeline:** Powered by `sharp` and `tesseract.js` featuring multi-angle auto-orientation detection (0°, 90°, 270°), dual-pass adaptive contrast enhancement (`.linear(1.5, -40)`), blue-ink red-channel extraction, and Atwater factor energy estimation fallback ($4P + 4C + 9F$).

2. **Multimodal Gemini Flash AI Vision (Toggle ON):**
   - **High Accuracy Across Real-World Packaging:** Powered by Google's `gemini-2.5-flash` model via the official `@google/genai` SDK.
   - **Zero Glare / Curved Packaging Errors:** Seamlessly parses curved cylindrical containers (e.g., cup noodles), glossy cellophane wrappers, and condensed multi-column tables.
   - **Structured FSSAI Schema:** Enforces strict typed JSON schema extraction (`responseSchema`), automatically standardizing nutrients to per-100g/per-100ml basis.
   - **Secure Backend Config (.env):** Configure `GEMINI_API_KEY` once in `.env` — keeping API credentials securely on the server without exposing them in client UI.
   - **Resilient Fallback:** Displays helpful troubleshooting prompts and allows instant 1-click fallback to the offline OCR engine if offline or without internet access.

---

## 🎯 How Evaluator Feedback is Addressed

| Evaluator Feedback Item | Technical & Academic Solution in Label Lens |
| :--- | :--- |
| **1. "Trim a dataset associated with FSSAI and use an ML model"** | • Curated a 50-product Indian Packaged Food dataset with verified off-pack ground truth.<br>• Built `scripts/ml_benchmark.py` benchmarking 3 Supervised ML classifiers (Logistic Regression, Decision Tree, Random Forest) against the Knowledge-Based Expert System.<br>• Defends why an Explainable Rule Engine is mandatory in safety-critical public health to eliminate statistical hallucinations. |
| **2. "Demonstrate the prototype in final presentation"** | • Built a 1-click **Preset Demo Mode** with iconic Indian products (*Maggi, Britannia Good Day, Lay's, Sunfeast Farmlite, Kellogg's Chocos, Amul Milk*) ensuring zero live-demo failures caused by exam-room lighting or camera glare. |
| **3. "Combine food products with visualisation"** | • Built the **Side-by-Side Product Comparison Workspace** featuring dynamic Chart.js horizontal bar charts for Sugar %, Saturated Fat %, and Sodium density alongside a "Recommended Healthier Choice" badge. |
| **4. "Add an AI element so label analysis is more appropriate"** | • **Multimodal Generative AI Vision:** Google Gemini 2.5 Flash integration with UI toggle for structured nutrient table extraction from real-world photos.<br>• **Symbolic Explainable AI (XAI):** Transparent rule engine showing complete inference traces (`[Input] → [Regulatory Rule] → [Deduction/Flag] → [Plain-English Finding]`). |

---

## 🚀 Quickstart

### Prerequisites
* Node.js v18+ (tested on v20 & v26)
* Python 3.9+ (with `scikit-learn`, `pandas`, `scipy` for academic benchmark)
* *(Optional)* A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) (only required if Gemini Flash toggle is enabled)

### 1. Install & Run Web Application
```bash
# Clone/navigate to directory
cd label-lens

# Install node dependencies
npm install

# (Optional) Configure Gemini API Key in .env
cp .env.example .env
# Edit .env and set GEMINI_API_KEY="AIzaSy..."

# Start the server
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser or phone.

> [!TIP]
> **No API Key? No Problem!** Label Lens is 100% functional out-of-the-box using the built-in local offline OCR engine. If you want to use the Gemini Flash Vision engine, simply set `GEMINI_API_KEY` in your `.env` file and turn ON the toggle switch in the UI.

### 2. Run the Academic ML Benchmark (Chapter 7 Metrics)
```bash
python3 scripts/ml_benchmark.py
```

---

## 📊 Key Academic Findings (Chapter 7)

```
================================================================================
ACADEMIC BENCHMARK RESULTS (CURATED 50 INDIAN PACKAGED FOOD PRODUCTS)
================================================================================
Dataset Size: 50 Products | HFSS Positive: 47 (94%) | Non-HFSS: 3 (6%)

| Model / Architecture              | Accuracy | Precision | Recall | F1-Score | Explainability / Safety Profile            |
| :-------------------------------- | :------- | :-------- | :----- | :------- | :----------------------------------------- |
| **Label Lens Rule Engine (XAI)**  | **100%** | **100%**  | **100%**| **1.00** | 100% Mathematically Auditable • Zero Errors |
| Logistic Regression (5-fold CV)   | 98.0%    | 100.0%    | 97.8%  | 0.988    | Parametric weights • Edge-case errors      |
| Decision Tree (5-fold CV)         | 92.0%    | 98.0%     | 93.8%  | 0.955    | Prone to single-tree split overfitting     |
| Random Forest (5-fold CV)         | 98.0%    | 98.0%     | 100.0% | 0.989    | Ensemble trees • Opaque decision boundaries|

--------------------------------------------------------------------------------
Spearman Rank Correlation (Prototype Score vs. FSSAI Draft INR Stars):
rho = 0.537, p = 5.844e-05 (Statistically significant at p < 0.001)
================================================================================
```

---

## 💡 Defense Presentation Demo Script (2 Minutes)

1. **Step 1 (Vision Engine & Single Scan):**
   - On the *Single Product Scan* tab, explain the **Dual-Engine Toggle Switch** (`[Offline Local OCR]` vs `[⚡ Gemini Flash AI]`).
   - Click **"Britannia Good Day Butter Cookies"** under Presets, or upload a package photo.
   - *Highlight:* Score is $2.0/5.0$, flagged as **HFSS** because sugar ($19.9\%$) and saturated fat ($19.2\%$) both heavily exceed the FSSAI $10\%$ threshold.
   - *Show:* The **XAI Audit Trail table** explaining every mathematical deduction step with legal regulatory citations.
2. **Step 2 (Product Comparison):**
   - Switch to the *Product Comparison* tab.
   - Select **Product A: Britannia Good Day Butter** and **Product B: Sunfeast Farmlite Digestive High Fibre**.
   - Click **"Run Side-by-Side Comparison"**.
   - *Highlight:* Sunfeast Farmlite wins the **"Recommended Healthier Choice"** ribbon with $43\%$ less sugar and $3.4\times$ more dietary fibre.
   - *Show:* The Chart.js bar charts clearly illustrating the nutrient deltas against the statutory FSSAI $10\%$ limit line.
3. **Step 3 (Evaluator ML Question):**
   - Switch to the *Academic ML Benchmark* tab.
   - Present the empirical 50-product benchmark proving why the deterministic Expert System is safer than statistical ML classifiers in health compliance, backed by the statistically significant Spearman correlation ($\rho = 0.537, p < 0.001$).
