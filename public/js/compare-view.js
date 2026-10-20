/**
 * Comparison View & Chart.js Visualization Engine
 */

let nutrientChartInstance = null;
let sodiumChartInstance = null;

export function renderComparisonWorkspace(comparisonData) {
  const container = document.getElementById('comparison-results');
  container.style.display = 'block';

  const { compared_products, better_choice } = comparisonData;

  // 1. Better Choice Banner
  const winnerNameEl = document.getElementById('winner-name');
  const winnerSummaryEl = document.getElementById('winner-summary');
  const winnerReasonsEl = document.getElementById('winner-reasons');

  winnerNameEl.textContent = better_choice.winner_name;
  winnerSummaryEl.textContent = `${better_choice.summary} (Suitability Score: ${better_choice.score}/5, INR Stars: ${better_choice.inr_stars}★)`;

  winnerReasonsEl.innerHTML = '';
  if (better_choice.key_reasons && better_choice.key_reasons.length > 0) {
    better_choice.key_reasons.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${r.comparison}:</strong> ${r.advantages.join(', ')}.`;
      winnerReasonsEl.appendChild(li);
    });
  }

  // 2. Comparative Product Cards Grid
  const cardsGrid = document.getElementById('comparison-cards-grid');
  cardsGrid.innerHTML = '';

  compared_products.forEach(prod => {
    const isWinner = prod.id === better_choice.winner_id;
    const evalData = prod.evaluation;
    const card = document.createElement('div');
    card.className = `comparison-card ${isWinner ? 'is-winner' : ''}`;

    let hfssBadge = evalData.hfss.is_hfss 
      ? '<span class="nutrient-status-tag status-high">HFSS Flagged ⚠️</span>'
      : '<span class="nutrient-status-tag status-good">Passed HFSS ✓</span>';

    card.innerHTML = `
      ${isWinner ? '<div class="winner-ribbon">Recommended</div>' : ''}
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--neutral-900); margin-bottom: 0.2rem;">${prod.name}</h3>
      <p style="font-size: 0.78rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${prod.brand} • ${prod.nutrients.serving_size || 'per 100g'}</p>

      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; padding: 0.5rem; background: var(--neutral-50); border-radius: var(--radius-sm);">
        <div>
          <div style="font-size: 0.75rem; color: var(--neutral-600); text-transform: uppercase;">Score</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${evalData.color_code};">${evalData.score} / 5</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.75rem; color: var(--neutral-600); text-transform: uppercase;">FSSAI INR Stars</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #fbbf24;">${evalData.inr.inr_stars} ⭐</div>
        </div>
      </div>

      <div style="margin-bottom: 0.75rem;">${hfssBadge}</div>

      <div style="font-size: 0.82rem; line-height: 1.6; color: var(--neutral-800);">
        <div><strong>Energy:</strong> ${evalData.nutrients.energy_kcal || prod.nutrients.energy_kcal || 'N/A'} kcal</div>
        <div><strong>Sugar:</strong> ${evalData.nutrients.sugar?.energy_pct || 0}% of energy (${evalData.nutrients.sugar?.value_g || 0}g)</div>
        <div><strong>Saturated Fat:</strong> ${evalData.nutrients.saturated_fat?.energy_pct || 0}% of energy (${evalData.nutrients.saturated_fat?.value_g || 0}g)</div>
        <div><strong>Sodium:</strong> ${evalData.nutrients.sodium?.ratio_mg_per_kcal || 0} mg/kcal (${evalData.nutrients.sodium?.value_mg || 0}mg)</div>
        <div><strong>Protein:</strong> ${prod.nutrients.protein_g || 0}g | <strong>Fibre:</strong> ${prod.nutrients.dietary_fibre_g || 0}g</div>
        <div><strong>Flagged Additives:</strong> ${evalData.additives.length} substances</div>
      </div>
    `;

    cardsGrid.appendChild(card);
  });

  // 3. Render Visual Charts via Chart.js
  renderCharts(compared_products);
}

function renderCharts(products) {
  const labels = products.map(p => p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name);

  const sugarPcts = products.map(p => p.evaluation.nutrients.sugar?.energy_pct || 0);
  const satFatPcts = products.map(p => p.evaluation.nutrients.saturated_fat?.energy_pct || 0);
  const sodiumRatios = products.map(p => p.evaluation.nutrients.sodium?.ratio_mg_per_kcal || 0);

  // Destroy existing chart instances if already present
  if (nutrientChartInstance) nutrientChartInstance.destroy();
  if (sodiumChartInstance) sodiumChartInstance.destroy();

  // Chart 1: Sugar & Saturated Fat % of Energy
  const ctxNutrient = document.getElementById('nutrientBarChart').getContext('2d');
  nutrientChartInstance = new Chart(ctxNutrient, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Total Sugar (% kcal)',
          data: sugarPcts,
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1
        },
        {
          label: 'Saturated Fat (% kcal)',
          data: satFatPcts,
          backgroundColor: 'rgba(249, 115, 22, 0.75)',
          borderColor: '#f97316',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '% of Total Food Energy' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterBody: () => 'FSSAI Draft Threshold: Max 10.0% of total energy'
          }
        }
      }
    }
  });

  // Chart 2: Sodium Density (mg / kcal)
  const ctxSodium = document.getElementById('sodiumBarChart').getContext('2d');
  sodiumChartInstance = new Chart(ctxSodium, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Sodium Density (mg/kcal)',
          data: sodiumRatios,
          backgroundColor: 'rgba(79, 70, 229, 0.75)',
          borderColor: '#4f46e5',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Ratio: mg Sodium per 1 kcal' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterBody: () => 'FSSAI Draft Threshold: Max 1.0 mg/kcal'
          }
        }
      }
    }
  });
}
