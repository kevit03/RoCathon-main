const DATA_PATH = "/output/brand_smart_home_top10.json";

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function average(items, mapper) {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + mapper(item), 0) / items.length;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function dominantTags(results) {
  const counts = new Map();

  results.forEach((result) => {
    result.content_style_tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function renderMetrics(results) {
  const metricGrid = document.getElementById("metricGrid");
  const template = document.getElementById("metricTemplate");
  const topCandidate = results[0];
  const portfolioReach = results.reduce((sum, item) => sum + item.metrics.follower_count, 0);
  const totalGmv = results.reduce((sum, item) => sum + item.metrics.total_gmv_30d, 0);
  const averageFinal = average(results, (item) => item.scores.final_score);
  const averageSemantic = average(results, (item) => item.scores.semantic_score);

  const metrics = [
    {
      label: "Lead Recommendation",
      value: topCandidate.username,
      subtext: `Highest blended score at ${topCandidate.scores.final_score.toFixed(2)}`,
    },
    {
      label: "Portfolio Reach",
      value: formatCompactNumber(portfolioReach),
      subtext: "Combined follower footprint across the recommended slate",
    },
    {
      label: "30D Commerce",
      value: formatCurrency(totalGmv),
      subtext: "Aggregate GMV across the top 10 candidates",
    },
    {
      label: "Average Semantic Fit",
      value: `${(averageSemantic * 100).toFixed(1)}%`,
      subtext: `Mean final score: ${averageFinal.toFixed(2)}`,
    },
  ];

  metrics.forEach((metric) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".metric-label").textContent = metric.label;
    fragment.querySelector(".metric-value").textContent = metric.value;
    fragment.querySelector(".metric-subtext").textContent = metric.subtext;
    metricGrid.appendChild(fragment);
  });
}

function renderFeaturedCandidate(results) {
  const featured = results[0];
  const second = results[1];
  const scoreGap = second
    ? (featured.scores.final_score - second.scores.final_score).toFixed(2)
    : "0.00";

  const container = document.getElementById("featuredCandidate");
  container.innerHTML = `
    <div class="feature-lead">
      <div>
        <p class="eyebrow">Top Recommendation</p>
        <h2 class="feature-title">${featured.username}</h2>
      </div>
      <span class="feature-score">Final Score ${featured.scores.final_score.toFixed(2)}</span>
    </div>
    <p class="feature-description">${featured.bio}</p>
    <div class="feature-stats">
      <span class="feature-stat">Projected ${featured.projected_score.toFixed(2)}</span>
      <span class="feature-stat">Semantic ${(featured.scores.semantic_score * 100).toFixed(1)}%</span>
      <span class="feature-stat">30D GMV ${formatCurrency(featured.metrics.total_gmv_30d)}</span>
      <span class="feature-stat">Reach ${formatCompactNumber(featured.metrics.follower_count)}</span>
      <span class="feature-stat">Lead Margin +${scoreGap}</span>
    </div>
  `;
}

function renderMethodPills(payload) {
  const methodPills = document.getElementById("methodPills");
  const pills = [
    `Provider: ${payload.embedding_provider}`,
    `Backend: ${payload.vector_backend}`,
    `Top 10 candidates`,
    `Brand: ${payload.brand_profile}`,
  ];

  pills.forEach((label) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = label;
    methodPills.appendChild(pill);
  });
}

function renderInsights(results) {
  const topCandidate = results[0];
  const topHomeCreators = results.filter((item) => item.content_style_tags.includes("Home")).length;
  const topElectronicsCreators = results.filter((item) =>
    item.content_style_tags.includes("Phones & Electronics")
  ).length;
  const highestCommerce = [...results].sort(
    (left, right) => right.metrics.total_gmv_30d - left.metrics.total_gmv_30d
  )[0];
  const highestReach = [...results].sort(
    (left, right) => right.metrics.follower_count - left.metrics.follower_count
  )[0];

  const insights = [
    {
      title: "Commercial Anchor",
      copy: `${topCandidate.username} leads the slate with the strongest blended score and a projected score of ${topCandidate.projected_score.toFixed(2)}.`,
    },
    {
      title: "Category Signal",
      copy: `${topHomeCreators} of the top 10 creators are explicitly in Home, with ${topElectronicsCreators} more adjacent through Phones & Electronics.`,
    },
    {
      title: "Scale vs. Precision",
      copy: `${highestReach.username} delivers the largest audience footprint, while ${highestCommerce.username} carries the highest 30-day GMV in the final slate.`,
    },
  ];

  const insightList = document.getElementById("insightList");
  insights.forEach((insight) => {
    const wrapper = document.createElement("article");
    wrapper.className = "insight-item";
    wrapper.innerHTML = `
      <strong class="insight-title">${insight.title}</strong>
      <p class="insight-copy">${insight.copy}</p>
    `;
    insightList.appendChild(wrapper);
  });
}

function renderDistribution(results) {
  const list = document.getElementById("distributionList");
  const tags = dominantTags(results);

  tags.forEach(([tag, count]) => {
    const share = (count / results.length) * 100;
    const item = document.createElement("article");
    item.className = "distribution-item";
    item.innerHTML = `
      <div>
        <strong class="distribution-title">${tag}</strong>
        <span class="detail-copy">${count} of ${results.length} shortlisted creators</span>
      </div>
      <div class="distribution-bar">
        <div class="distribution-fill" style="width: ${share}%"></div>
      </div>
    `;
    list.appendChild(item);
  });
}

function metricDetail(label, value, widthPercent) {
  return `
    <div class="detail-card">
      <span class="detail-label">${label}</span>
      <strong class="detail-value">${value}</strong>
      <div class="bar">
        <div class="bar-fill" style="width: ${Math.max(6, Math.min(widthPercent, 100))}%"></div>
      </div>
    </div>
  `;
}

function renderRankList(results) {
  const rankList = document.getElementById("rankList");

  results.forEach((result, index) => {
    const element = document.createElement("article");
    element.className = "rank-card";
    element.innerHTML = `
      <div class="rank-position">#${index + 1}</div>
      <div>
        <div class="rank-head">
          <div>
            <h3 class="rank-name">${result.username}</h3>
            <div class="rank-tags">
              ${result.content_style_tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
          </div>
          <span class="score-chip">Final ${result.scores.final_score.toFixed(2)}</span>
        </div>
        <p class="rank-bio">${result.bio}</p>
        <div class="detail-grid">
          ${metricDetail("Projected Score", result.projected_score.toFixed(2), result.projected_score)}
          ${metricDetail("Semantic Fit", formatPercent(result.scores.semantic_score), result.scores.semantic_score * 100)}
          ${metricDetail("30D GMV", formatCurrency(result.metrics.total_gmv_30d), Math.min((result.metrics.total_gmv_30d / 150000) * 100, 100))}
          ${metricDetail("Avg Views", formatCompactNumber(result.metrics.avg_views_30d), Math.min((result.metrics.avg_views_30d / 2000000) * 100, 100))}
        </div>
      </div>
      <aside class="rank-side">
        <label>Followers</label>
        <strong>${formatInteger(result.metrics.follower_count)}</strong>
        <label>Engagement</label>
        <strong>${formatPercent(result.metrics.engagement_rate)}</strong>
        <label>Audience</label>
        <strong>${result.metrics.demographics.major_gender} · ${result.metrics.demographics.age_ranges.join(", ")}</strong>
      </aside>
    `;
    rankList.appendChild(element);
  });
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load ranking data (${response.status})`);
    }

    const payload = await response.json();
    const generatedAt = new Date(payload.generated_at).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    setText("brandProfile", payload.brand_profile);
    setText("queryText", payload.query);
    setText("generatedAt", generatedAt);

    renderMetrics(payload.results);
    renderFeaturedCandidate(payload.results);
    renderMethodPills(payload);
    renderInsights(payload.results);
    renderDistribution(payload.results);
    renderRankList(payload.results);
  } catch (error) {
    document.body.innerHTML = `
      <main class="page-shell">
        <section class="panel">
          <p class="eyebrow">Atlas Brief</p>
          <h1>Dashboard unavailable</h1>
          <p class="hero-summary">${
            error instanceof Error ? error.message : "Unknown loading error"
          }</p>
          <p class="hero-summary">Run the demo first so <code>${DATA_PATH}</code> exists, then reload the dashboard.</p>
        </section>
      </main>
    `;
  }
}

init();
