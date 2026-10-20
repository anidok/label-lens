import { renderComparisonWorkspace } from './compare-view.js';

// Application State
const state = {
  presets: [],
  currentProduct: null,
  comparisonPool: []
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSubtabs();
  loadPresets();
  setupEventListeners();
});

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.style.display = 'block';
    });
  });
}

// Input Subtabs
function setupSubtabs() {
  const subtabs = document.querySelectorAll('.subtab-btn');
  subtabs.forEach(sub => {
    sub.addEventListener('click', () => {
      subtabs.forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.subtab-view').forEach(v => v.style.display = 'none');

      sub.classList.add('active');
      const target = document.getElementById(sub.dataset.subtab);
      if (target) target.style.display = 'block';
    });
  });
}

// Fetch Presets
async function loadPresets() {
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    state.presets = data.presets || [];
    state.comparisonPool = [...state.presets];

    renderPresetsGrid();
    populateCompareDropdowns();
  } catch (err) {
    console.error('Failed to load presets:', err);
    document.getElementById('presets-container').innerHTML = 
      `<div style="color: var(--danger); padding: 1rem;">Failed to connect to backend server. Make sure server is running.</div>`;
  }
}

// Render Presets Grid
function renderPresetsGrid() {
  const container = document.getElementById('presets-container');
  container.innerHTML = '';

  state.presets.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'preset-chip';
    chip.innerHTML = `
      <div class="preset-name">${p.name}</div>
      <div class="preset-brand">${p.brand} • ${p.category}</div>
      <div style="margin-top: 0.4rem; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.78rem; font-weight: 700; color: ${p.evaluation.color_code};">
          Score: ${p.evaluation.score}/5
        </span>
        <span style="font-size: 0.75rem; color: #fbbf24;">
          ${p.evaluation.inr.inr_stars} ⭐
        </span>
      </div>
    `;

    chip.addEventListener('click', () => {
      displayAnalysisResult(p);
    });

    container.appendChild(chip);
  });
}

// Populate Compare Dropdowns
function populateCompareDropdowns() {
  const sel1 = document.getElementById('compare-select-1');
  const sel2 = document.getElementById('compare-select-2');
  const sel3 = document.getElementById('compare-select-3');

  const optionsHtml = state.comparisonPool.map(p => 
    `<option value="${p.id}">${p.name} (${p.brand})</option>`
  ).join('');

  sel1.innerHTML = optionsHtml;
  sel2.innerHTML = optionsHtml;
  sel3.innerHTML = `<option value="">-- None (2 Products) --</option>` + optionsHtml;

  // Set default pairings (e.g. Good Day vs Farmlite Digestive, or Maggi vs Yippee)
  if (state.comparisonPool.length >= 2) {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 1;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Pasted Text Analyze
  const btnAnalyzeText = document.getElementById('btn-analyze-text');
  btnAnalyzeText.addEventListener('click', async () => {
    const text = document.getElementById('pasted-text-input').value.trim();
    if (!text) {
      alert('Please paste label text first.');
      return;
    }

    btnAnalyzeText.textContent = 'Analyzing...';
    try {
      const res = await fetch('/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      btnAnalyzeText.textContent = 'Analyze Label Text';

      if (data.success) {
        const customProduct = {
          id: `custom-${Date.now()}`,
          name: 'Scanned / Pasted Nutrition Panel',
          brand: 'Custom Input',
          category: 'Packaged Food',
          nutrients: data.parsed_nutrients,
          evaluation: data.evaluation
        };
        state.comparisonPool.unshift(customProduct);
        populateCompareDropdowns();
        displayAnalysisResult(customProduct);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      btnAnalyzeText.textContent = 'Analyze Label Text';
      alert('Failed to analyze: ' + err.message);
    }
  });

  // Vision Engine Toggle & Key Storage
  const geminiToggle = document.getElementById('gemini-toggle');
  const engineBadge = document.getElementById('engine-badge');
  const engineDesc = document.getElementById('engine-desc');
  const dropzoneHint = document.getElementById('dropzone-hint');
  const keyContainer = document.getElementById('gemini-key-container');
  const keyInput = document.getElementById('gemini-api-key-input');
  const btnSaveKey = document.getElementById('btn-save-gemini-key');

  // Load saved preferences
  const savedEngine = localStorage.getItem('label_lens_gemini_enabled');
  const savedKey = localStorage.getItem('label_lens_gemini_key');
  if (savedKey && keyInput) {
    keyInput.value = savedKey;
  }

  function updateToggleUI(isGemini) {
    if (isGemini) {
      if (engineBadge) {
        engineBadge.textContent = '⚡ GEMINI FLASH AI (Active)';
        engineBadge.style.background = '#e0e7ff';
        engineBadge.style.color = '#4338ca';
        engineBadge.style.border = '1px solid #c7d2fe';
      }
      if (engineDesc) {
        engineDesc.textContent = 'Multimodal AI vision enabled: High-accuracy extraction across curved, glossy packaging & micro-fonts.';
      }
      if (dropzoneHint) {
        dropzoneHint.textContent = 'Multimodal AI Vision with Google Gemini Flash — high-precision extraction for curved/glare labels';
      }
      if (keyContainer) keyContainer.style.display = 'flex';
    } else {
      if (engineBadge) {
        engineBadge.textContent = 'OFFLINE (Tesseract.js)';
        engineBadge.style.background = '#f1f5f9';
        engineBadge.style.color = '#475569';
        engineBadge.style.border = '1px solid #cbd5e1';
      }
      if (engineDesc) {
        engineDesc.textContent = 'Toggle OFF for 100% offline local OCR (no cloud, private). Toggle ON for multimodal AI (best for curved packaging, glare, & fine fonts).';
      }
      if (dropzoneHint) {
        dropzoneHint.textContent = 'Processed locally using Sharp & Tesseract.js (no cloud upload, 100% private)';
      }
      if (keyContainer) keyContainer.style.display = 'none';
    }
  }

  if (geminiToggle) {
    geminiToggle.checked = savedEngine === 'true';
    updateToggleUI(geminiToggle.checked);

    geminiToggle.addEventListener('change', () => {
      localStorage.setItem('label_lens_gemini_enabled', geminiToggle.checked);
      updateToggleUI(geminiToggle.checked);
    });
  }

  if (btnSaveKey && keyInput) {
    btnSaveKey.addEventListener('click', () => {
      const val = keyInput.value.trim();
      localStorage.setItem('label_lens_gemini_key', val);
      alert(val ? '✓ Gemini API key saved locally in browser!' : 'Gemini API key cleared.');
    });
  }

  // Dropzone Image Upload with Animated Multi-Stage Progress Bar
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('image-input');
  const loadingBox = document.getElementById('ocr-loading-box');
  const progressBar = document.getElementById('ocr-progress-bar');
  const pctText = document.getElementById('ocr-pct-text');
  const substepText = document.getElementById('ocr-substep-text');
  const statusMsg = document.getElementById('ocr-status-message');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--neutral-300)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--neutral-300)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleImageUpload(fileInput.files[0]);
    }
  });

  async function handleImageUpload(file) {
    statusMsg.style.display = 'none';
    loadingBox.style.display = 'block';

    const isGemini = geminiToggle && geminiToggle.checked;
    const clientKey = (keyInput && keyInput.value.trim()) || localStorage.getItem('label_lens_gemini_key') || '';

    const updateProgress = (pct, stepMsg) => {
      progressBar.style.width = `${pct}%`;
      pctText.textContent = `${pct}%`;
      if (stepMsg) substepText.textContent = stepMsg;
    };

    let timer1, timer2;
    if (isGemini) {
      updateProgress(25, 'Step 1/3: Connecting to Google Gemini Flash Vision...');
      timer1 = setTimeout(() => {
        updateProgress(65, 'Step 2/3: Multimodal AI reading nutrition table & ingredients list...');
      }, 700);
      timer2 = setTimeout(() => {
        updateProgress(88, 'Step 3/3: Evaluating extracted nutrients against draft FSSAI thresholds...');
      }, 1800);
    } else {
      updateProgress(20, 'Step 1/3: Upscaling resolution & normalising contrast with Sharp...');
      timer1 = setTimeout(() => {
        updateProgress(55, 'Step 2/3: Running Tesseract.js neural OCR text recognition...');
      }, 600);
      timer2 = setTimeout(() => {
        updateProgress(80, 'Step 3/3: Evaluating parsed values against FSSAI draft criteria...');
      }, 1800);
    }

    const formData = new FormData();
    formData.append('engine', isGemini ? 'gemini' : 'tesseract');
    if (isGemini && clientKey) {
      formData.append('gemini_api_key', clientKey);
    }
    formData.append('label_image', file);

    try {
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (data.success) {
        updateProgress(100, '✓ Complete! Rendering analysis...');
        setTimeout(() => {
          loadingBox.style.display = 'none';
          statusMsg.style.display = 'block';

          if (data.engine_used === 'gemini') {
            statusMsg.innerHTML = `<span style="color: var(--primary); font-weight: 600;">⚡ Analyzed "${file.name}" via Google Gemini Flash AI Vision.</span>`;
          } else {
            statusMsg.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ Scanned "${file.name}" locally via Tesseract.js (Confidence: ${Math.round(data.confidence || 88)}%).</span>`;
          }

          const scannedProduct = {
            id: `ocr-${Date.now()}`,
            name: data.product_name || `Scanned Label (${file.name})`,
            brand: data.brand || (data.engine_used === 'gemini' ? 'AI Vision' : 'Uploaded Image'),
            category: 'Food Product',
            engine_used: data.engine_used || (isGemini ? 'gemini' : 'tesseract'),
            nutrients: data.parsed_nutrients,
            evaluation: data.evaluation
          };
          state.comparisonPool.unshift(scannedProduct);
          populateCompareDropdowns();
          displayAnalysisResult(scannedProduct);
        }, 400);
      } else {
        clearTimeout(timer1);
        clearTimeout(timer2);
        loadingBox.style.display = 'none';
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = `<span style="color: var(--danger); font-weight: 600;">Failed: ${data.error}</span>`;
      }
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      loadingBox.style.display = 'none';
      statusMsg.style.display = 'block';
      statusMsg.innerHTML = `<span style="color: var(--danger); font-weight: 600;">Image analysis error: ${err.message}</span>`;
    }
  }

  // Trigger Comparison
  document.getElementById('btn-trigger-compare').addEventListener('click', async () => {
    const id1 = document.getElementById('compare-select-1').value;
    const id2 = document.getElementById('compare-select-2').value;
    const id3 = document.getElementById('compare-select-3').value;

    if (!id1 || !id2) {
      alert('Please select at least Product A and Product B to compare.');
      return;
    }

    const selectedIds = [id1, id2];
    if (id3) selectedIds.push(id3);

    const prodsToCompare = selectedIds.map(id => state.comparisonPool.find(p => p.id === id)).filter(Boolean);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: prodsToCompare })
      });
      const compData = await res.json();
      if (compData.success) {
        renderComparisonWorkspace(compData);
      } else {
        alert('Comparison error: ' + compData.error);
      }
    } catch (err) {
      alert('Comparison failed: ' + err.message);
    }
  });

  // Add current product to compare
  document.getElementById('btn-add-to-compare').addEventListener('click', () => {
    if (!state.currentProduct) return;
    const compareTabBtn = document.querySelector('.nav-tab-btn[data-tab="tab-compare"]');
    compareTabBtn.click();
    const sel1 = document.getElementById('compare-select-1');
    sel1.value = state.currentProduct.id;
  });

  // Toggle Edit Card
  const btnToggleEdit = document.getElementById('btn-toggle-edit');
  const editCard = document.getElementById('edit-values-card');
  btnToggleEdit.addEventListener('click', () => {
    editCard.style.display = editCard.style.display === 'none' ? 'block' : 'none';
  });

  // Recalculate / Update Manual Values
  document.getElementById('btn-recalculate-values').addEventListener('click', async () => {
    const manualNutrients = {
      energy_kcal: document.getElementById('edit-energy').value,
      total_sugars_g: document.getElementById('edit-sugar').value,
      saturated_fat_g: document.getElementById('edit-satfat').value,
      sodium_mg: document.getElementById('edit-sodium').value,
      protein_g: document.getElementById('edit-protein').value,
      dietary_fibre_g: document.getElementById('edit-fibre').value,
      ingredients_text: document.getElementById('edit-ingredients').value
    };

    try {
      const res = await fetch('/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualNutrients })
      });
      const data = await res.json();
      if (data.success) {
        state.currentProduct.nutrients = data.parsed_nutrients;
        state.currentProduct.evaluation = data.evaluation;
        populateCompareDropdowns();
        displayAnalysisResult(state.currentProduct);
        alert('✓ Analysis successfully recalculated with updated values!');
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Recalculation failed: ' + err.message);
    }
  });
}

// Display Analysis Results
function displayAnalysisResult(product) {
  state.currentProduct = product;
  const resultsEl = document.getElementById('analysis-results');
  resultsEl.style.display = 'block';

  // Smooth scroll to results
  resultsEl.scrollIntoView({ behavior: 'smooth' });

  // 1. Meta
  document.getElementById('result-product-name').textContent = product.name;
  document.getElementById('result-product-meta').textContent = 
    `${product.brand || 'Brand'} • ${product.category || 'Food Category'} • Serving: ${product.nutrients.serving_size || 'per 100g'}`;

  const resultEngineBadge = document.getElementById('result-engine-badge');
  if (resultEngineBadge) {
    if (product.engine_used === 'gemini') {
      resultEngineBadge.style.display = 'inline-block';
      resultEngineBadge.textContent = '⚡ Gemini Flash Vision';
      resultEngineBadge.style.background = '#e0e7ff';
      resultEngineBadge.style.color = '#4338ca';
      resultEngineBadge.style.border = '1px solid #c7d2fe';
    } else if (product.engine_used === 'tesseract') {
      resultEngineBadge.style.display = 'inline-block';
      resultEngineBadge.textContent = '🖥️ Offline Local OCR';
      resultEngineBadge.style.background = '#f1f5f9';
      resultEngineBadge.style.color = '#475569';
      resultEngineBadge.style.border = '1px solid #cbd5e1';
    } else {
      resultEngineBadge.style.display = 'none';
    }
  }

  const ev = product.evaluation;
  const nut = product.nutrients || {};

  // Populate Edit Fields
  document.getElementById('edit-energy').value = nut.energy_kcal !== null && nut.energy_kcal !== undefined ? nut.energy_kcal : '';
  document.getElementById('edit-sugar').value = nut.total_sugars_g !== null && nut.total_sugars_g !== undefined ? nut.total_sugars_g : '';
  document.getElementById('edit-satfat').value = nut.saturated_fat_g !== null && nut.saturated_fat_g !== undefined ? nut.saturated_fat_g : '';
  document.getElementById('edit-sodium').value = nut.sodium_mg !== null && nut.sodium_mg !== undefined ? nut.sodium_mg : '';
  document.getElementById('edit-protein').value = nut.protein_g !== null && nut.protein_g !== undefined ? nut.protein_g : '';
  document.getElementById('edit-fibre').value = nut.dietary_fibre_g !== null && nut.dietary_fibre_g !== undefined ? nut.dietary_fibre_g : '';
  document.getElementById('edit-ingredients').value = nut.ingredients_text || '';

  const editCard = document.getElementById('edit-values-card');

  // Handle Incomplete OCR case
  if (ev.is_incomplete) {
    editCard.style.display = 'block'; // auto open edit form
  }

  // 2. Score Badge
  const scoreBox = document.getElementById('score-box');
  const scoreVal = document.getElementById('score-val');
  const scoreLabel = document.getElementById('score-label');

  if (ev.score !== null) {
    scoreVal.textContent = ev.score.toFixed(1);
    scoreVal.style.color = ev.color_code;
    scoreLabel.textContent = ev.score_label;
    scoreLabel.style.color = ev.color_code;
  } else {
    scoreVal.textContent = '--';
    scoreVal.style.color = '#94a3b8';
    scoreLabel.textContent = 'Incomplete Data (Values Missing)';
    scoreLabel.style.color = '#64748b';
  }

  // 3. INR Stars
  if (ev.inr.inr_stars !== null) {
    document.getElementById('inr-stars').textContent = '⭐'.repeat(Math.floor(ev.inr.inr_stars)) + (ev.inr.inr_stars % 1 !== 0 ? '½' : '');
    document.getElementById('inr-stars-text').textContent = `${ev.inr.inr_stars} / 5.0 Stars (Draft INR)`;
    document.getElementById('inr-points-desc').textContent = 
      `Schedule V: Net score ${ev.inr.final_score} (${ev.inr.breakdown.total_negative_points || 0} neg - ${ev.inr.breakdown.total_positive_points || 0} pos)`;
  } else {
    document.getElementById('inr-stars').textContent = '☆☆☆☆☆';
    document.getElementById('inr-stars-text').textContent = 'Unrated (Incomplete Fields)';
    document.getElementById('inr-points-desc').textContent = 'Energy, sugar, or sodium values missing from panel.';
  }

  // 4. HFSS Banner
  const hfssBanner = document.getElementById('hfss-banner');
  const hfssTitle = document.getElementById('hfss-title');
  const hfssReasons = document.getElementById('hfss-reasons');

  if (ev.is_incomplete || ev.hfss.undetermined) {
    hfssBanner.className = 'hfss-alert-banner';
    hfssBanner.style.background = '#f8fafc';
    hfssBanner.style.borderLeft = '5px solid #64748b';
    hfssBanner.style.color = '#334155';
    hfssTitle.textContent = '⚠️ Nutrition Values Incomplete or Missing';
    hfssReasons.innerHTML = 'OCR could not automatically detect essential values from this image. Please click <strong>"Edit Extracted Values"</strong> above to review or type in the values from your pack.';
  } else if (ev.hfss.is_hfss) {
    hfssBanner.style = '';
    hfssBanner.className = 'hfss-alert-banner high-risk';
    hfssTitle.textContent = 'Classified as High Fat, Sugar, Salt (HFSS) ⚠️';
    hfssReasons.innerHTML = `<strong>Violated Draft FSSAI Limits:</strong><ul style="margin-top: 0.25rem; padding-left: 1.25rem;">${ev.hfss.reasons.map(r => `<li>${r}</li>`).join('')}</ul>`;
  } else {
    hfssBanner.style = '';
    hfssBanner.className = 'hfss-alert-banner balanced';
    hfssTitle.textContent = 'Complies with FSSAI Draft HFSS Criteria ✓';
    hfssReasons.textContent = 'Sugar, saturated fat, and sodium are all within safe regulatory thresholds.';
  }

  // 5. Nutrients Traffic Light Grid
  const nutContainer = document.getElementById('nutrients-cards-container');
  nutContainer.innerHTML = '';

  const energyKcal = ev.nutrients.energy_kcal || product.nutrients.energy_kcal || 0;

  // Helper to build nutrient cards
  const buildNutrientCard = (name, valStr, subStr, status, pctEnergy, limitPct, isSodiumRatio = false) => {
    let tagClass = 'status-good';
    let tagText = 'Safe Level';
    let barColor = 'var(--success)';

    if (status === 'HIGH_RISK') {
      tagClass = 'status-high';
      tagText = 'High / Exceeds Limit';
      barColor = 'var(--danger)';
    } else if (status === 'MODERATE') {
      tagClass = 'status-mod';
      tagText = 'Moderate';
      barColor = 'var(--warning)';
    }

    const card = document.createElement('div');
    card.className = 'nutrient-card';
    card.innerHTML = `
      <div class="nutrient-name">${name}</div>
      <div class="nutrient-val">${valStr}</div>
      <div style="font-size: 0.8rem; color: var(--neutral-600); margin-bottom: 0.35rem;">${subStr}</div>
      ${pctEnergy !== null ? `
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${Math.min(100, (pctEnergy / 25) * 100)}%; background: ${barColor};"></div>
          <div class="progress-threshold-line" style="left: ${(limitPct / 25) * 100}%;" title="FSSAI Limit: ${limitPct}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--neutral-600);">
          <span>0%</span>
          <span style="font-weight: 700; color: #b45309;">Limit (${limitPct}%)</span>
          <span>25%+</span>
        </div>
      ` : ''}
      <div style="margin-top: 0.5rem;">
        <span class="nutrient-status-tag ${tagClass}">${tagText}</span>
      </div>
    `;
    nutContainer.appendChild(card);
  };

  // Sugar
  const sug = ev.nutrients.sugar || {};
  buildNutrientCard('Total Sugars', `${sug.value_g || 0}g`, `${sug.energy_pct || 0}% of calories`, sug.status, sug.energy_pct, 10);

  // Saturated Fat
  const sat = ev.nutrients.saturated_fat || {};
  buildNutrientCard('Saturated Fat', `${sat.value_g || 0}g`, `${sat.energy_pct || 0}% of calories`, sat.status, sat.energy_pct, 10);

  // Sodium
  const sod = ev.nutrients.sodium || {};
  buildNutrientCard('Sodium', `${sod.value_mg || 0}mg`, `${sod.ratio_mg_per_kcal || 0} mg/kcal (Limit: 1.0)`, sod.status, null, null);

  // Energy & Protein
  const cardEnergy = document.createElement('div');
  cardEnergy.className = 'nutrient-card';
  cardEnergy.innerHTML = `
    <div class="nutrient-name">Energy & Protein</div>
    <div class="nutrient-val">${energyKcal} kcal</div>
    <div style="font-size: 0.82rem; color: var(--neutral-600); margin-top: 0.25rem;">
      Protein: <strong>${product.nutrients.protein_g || 0}g</strong> | Fibre: <strong>${product.nutrients.dietary_fibre_g || 0}g</strong>
    </div>
  `;
  nutContainer.appendChild(cardEnergy);

  // 6. Allergens
  const allgContainer = document.getElementById('allergens-container');
  const allgCount = document.getElementById('allergens-count');
  if (ev.allergens.length > 0) {
    allgCount.textContent = `${ev.allergens.length} detected`;
    allgContainer.innerHTML = `<div class="badges-container">${ev.allergens.map(a => 
      `<span class="allergen-tag">⚠️ ${a.family_name} (${a.matched_terms.join(', ')})</span>`
    ).join('')}</div>`;
  } else {
    allgCount.textContent = 'None';
    allgContainer.innerHTML = '<p style="font-size: 0.85rem; color: var(--neutral-600);">No common allergens identified from the ingredient text.</p>';
  }

  // 7. Additives
  const addContainer = document.getElementById('additives-container');
  const addCount = document.getElementById('additives-count');
  if (ev.additives.length > 0) {
    addCount.textContent = `${ev.additives.length} flagged`;
    addContainer.innerHTML = ev.additives.map(ad => `
      <div class="additive-item">
        <div class="additive-title">${ad.code}: ${ad.name} (${ad.category})</div>
        <div class="additive-desc"><strong>Purpose:</strong> ${ad.purpose}</div>
        <div class="additive-desc" style="color: #991b1b;"><strong>Health Concern:</strong> ${ad.concern}</div>
      </div>
    `).join('');
  } else {
    addCount.textContent = '0 flagged';
    addContainer.innerHTML = '<p style="font-size: 0.85rem; color: var(--neutral-600);">No high-concern synthetic additives found in the ingredient list.</p>';
  }

  // 8. Explainable AI Reasoning Trace Table
  const traceBody = document.getElementById('xai-trace-body');
  traceBody.innerHTML = '';

  ev.reasoning_trace.forEach(step => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; text-align: center;">${step.step}</td>
      <td style="font-weight: 600;">${step.name}</td>
      <td><code>${step.input}</code></td>
      <td><strong>${step.calculated}</strong></td>
      <td style="font-size: 0.8rem; color: var(--neutral-600);">${step.criterion}</td>
      <td><span class="nutrient-status-tag ${step.status === 'HIGH_RISK' ? 'status-high' : (step.status === 'ALERT' ? 'status-mod' : 'status-good')}">${step.status}</span></td>
      <td style="font-weight: 700; color: ${step.deduction.startsWith('-') ? 'var(--danger)' : 'var(--neutral-600)'};">${step.deduction}</td>
      <td style="font-size: 0.82rem;">${step.finding}</td>
    `;
    traceBody.appendChild(tr);
  });
}
