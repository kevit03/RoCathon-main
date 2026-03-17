const DATA_PATH = "/api/dashboard-data";

const quizQuestions = [
  {
    id: "objective",
    prompt: "What matters most right now?",
    options: [
      { value: "sales", label: "Revenue now" },
      { value: "loyalty", label: "Ecosystem loyalty" },
      { value: "awareness", label: "Reach expansion" },
    ],
  },
  {
    id: "voice",
    prompt: "What creator voice fits the brief?",
    options: [
      { value: "technical", label: "Technical authority" },
      { value: "lifestyle", label: "Lifestyle integration" },
      { value: "trend", label: "Trend-led tastemaker" },
    ],
  },
  {
    id: "rollout",
    prompt: "How concentrated should the plan be?",
    options: [
      { value: "broad", label: "Broad launch" },
      { value: "balanced", label: "Balanced mix" },
      { value: "niche", label: "High-intent niche" },
    ],
  },
];

const state = {
  selectedProfileId: "brand_smart_home",
  selectedIndustry: "all",
  searchTerm: "",
  selectedCreatorUsername: null,
  showScoreHelp: false,
  quizStarted: false,
  quizStep: 0,
  quizAnswers: {},
};

let dashboardData = null;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(sourceTokens, targetTokens) {
  const targetSet = new Set(targetTokens);
  if (targetSet.size === 0) {
    return 0;
  }
  const matches = [...new Set(sourceTokens)].filter((token) => targetSet.has(token)).length;
  return matches / targetSet.size;
}

function normalizeProjected(score) {
  return clamp((score - 60) / 40);
}

function normalizeLog(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }
  return clamp(Math.log1p(value) / Math.log1p(maxValue));
}

function normalizeGenderShare(value) {
  if (value <= 1) {
    return value;
  }
  if (value <= 100) {
    return value / 100;
  }
  return value / 10000;
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function percentile(sortedValues, pct) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.floor(clamp(pct, 0, 1) * (sortedValues.length - 1));
  return sortedValues[index];
}

function getProfileDetail(id) {
  return dashboardData.brandProfiles.find((profile) => profile.id === id);
}

function creatorAudienceFit(creator, profile) {
  const demographics = creator.metrics.demographics;
  const dominantGenderShare = normalizeGenderShare(demographics.gender_pct);
  const genderFit =
    demographics.major_gender === profile.target_audience.gender
      ? dominantGenderShare
      : 1 - dominantGenderShare;

  const creatorAges = new Set(demographics.age_ranges);
  const profileAges = new Set(profile.target_audience.age_ranges);
  const overlap = [...profileAges].filter((ageRange) => creatorAges.has(ageRange)).length;
  const ageFit = profileAges.size === 0 ? 0 : overlap / profileAges.size;

  return clamp(0.6 * genderFit + 0.4 * ageFit);
}

function industryFit(creator, profile) {
  const creatorTags = new Set(creator.content_style_tags);
  const profileIndustries = new Set(profile.industries);
  const overlap = [...profileIndustries].filter((industry) => creatorTags.has(industry)).length;
  return profileIndustries.size === 0 ? 0 : overlap / profileIndustries.size;
}

function buildUniverse(profileDetail) {
  const searchTokens = tokenize(
    `${profileDetail.defaultQuery} ${state.searchTerm} ${profileDetail.label}`
  );
  const filteredCreators = dashboardData.creators.filter((creator) => {
    if (state.selectedIndustry === "all") {
      return true;
    }
    return creator.content_style_tags.includes(state.selectedIndustry);
  });

  const maxGmv = Math.max(...filteredCreators.map((creator) => creator.metrics.total_gmv_30d), 1);
  const maxViews = Math.max(...filteredCreators.map((creator) => creator.metrics.avg_views_30d), 1);
  const maxFollowers = Math.max(
    ...filteredCreators.map((creator) => creator.metrics.follower_count),
    1
  );

  const scored = filteredCreators
    .map((creator) => {
      const creatorTokens = tokenize(
        `${creator.username} ${creator.bio} ${creator.content_style_tags.join(" ")}`
      );
      const queryOverlap = overlapScore(creatorTokens, searchTokens);
      const industry = industryFit(creator, profileDetail.profile);
      const audience = creatorAudienceFit(creator, profileDetail.profile);
      const commercialIndex =
        0.65 * normalizeProjected(creator.projected_score) +
        0.2 * clamp(creator.metrics.engagement_rate / 0.12) +
        0.15 * normalizeLog(creator.metrics.total_gmv_30d, maxGmv);
      const semanticProxy = 0.55 * industry + 0.45 * queryOverlap;
      const atlasScore =
        100 *
        clamp(
          0.38 * industry +
            0.27 * queryOverlap +
            0.15 * audience +
            0.2 * commercialIndex
        );

      return {
        ...creator,
        atlasScore: round(atlasScore, 2),
        diagnostics: {
          industryFit: round(industry, 4),
          queryOverlap: round(queryOverlap, 4),
          audienceFit: round(audience, 4),
          commercialIndex: round(commercialIndex, 4),
          semanticProxy: round(semanticProxy, 4),
          gmvNorm: round(normalizeLog(creator.metrics.total_gmv_30d, maxGmv), 4),
          viewsNorm: round(normalizeLog(creator.metrics.avg_views_30d, maxViews), 4),
          followersNorm: round(normalizeLog(creator.metrics.follower_count, maxFollowers), 4),
        },
      };
    })
    .filter((creator) => {
      const keywordTokens = tokenize(state.searchTerm);
      if (keywordTokens.length === 0) {
        return true;
      }
      return creator.diagnostics.queryOverlap > 0;
    })
    .sort((left, right) => right.atlasScore - left.atlasScore);

  if (!state.selectedCreatorUsername || !scored.some((item) => item.username === state.selectedCreatorUsername)) {
    state.selectedCreatorUsername = scored[0]?.username ?? null;
  }

  return {
    all: scored,
    top: scored.slice(0, 20),
    topTen: scored.slice(0, 10),
    selected: scored.find((item) => item.username === state.selectedCreatorUsername) ?? null,
  };
}

function getCurrentView() {
  const profileDetail = getProfileDetail(state.selectedProfileId);
  const universe = buildUniverse(profileDetail);

  return {
    profileDetail,
    universe,
    mode:
      state.searchTerm || state.selectedIndustry !== "all"
        ? "Filtered market scan"
        : "Full universe screen",
  };
}

function getIndustries() {
  const industries = new Set(["all"]);
  dashboardData.creators.forEach((creator) => {
    creator.content_style_tags.forEach((tag) => industries.add(tag));
  });
  return [...industries];
}

function renderControls(view) {
  const profileSelect = document.getElementById("profileSelect");
  const industrySelect = document.getElementById("industrySelect");
  const typeSearch = document.getElementById("typeSearch");

  profileSelect.innerHTML = dashboardData.brandProfiles
    .map(
      (profile) =>
        `<option value="${profile.id}" ${profile.id === state.selectedProfileId ? "selected" : ""}>${profile.label}</option>`
    )
    .join("");

  industrySelect.innerHTML = getIndustries()
    .map((industry) => {
      const label = industry === "all" ? "All industries" : industry;
      return `<option value="${industry}" ${industry === state.selectedIndustry ? "selected" : ""}>${label}</option>`;
    })
    .join("");

  typeSearch.value = state.searchTerm;
  document.getElementById("profileTagline").textContent = view.profileDetail.tagline;
  document.getElementById("scenarioMode").textContent = view.mode;
}

function renderMeta(view) {
  const generatedAt = new Date(dashboardData.challengeOutput.generated_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  document.getElementById("universeCount").textContent = `${view.universe.all.length}`;
  document.getElementById("generatedAt").textContent = generatedAt;
  document.getElementById("analyticsCaption").textContent = state.searchTerm
    ? `Filtered by "${state.searchTerm}" in ${view.profileDetail.label}.`
    : view.profileDetail.tagline;
}

function renderSelectedCreator(view) {
  const target = document.getElementById("selectedCreatorSummary");
  const breakdown = document.getElementById("scoreBreakdown");
  const help = document.getElementById("scoreHelp");
  const creator = view.universe.selected;

  if (!creator) {
    target.innerHTML = "<p class='detail-copy'>No creator selected.</p>";
    breakdown.innerHTML = "";
    help.hidden = !state.showScoreHelp;
    return;
  }

  target.innerHTML = `
    <strong style="display:block;font-size:1.05rem;overflow-wrap:anywhere;">${creator.username}</strong>
    <p class="detail-copy" style="margin:8px 0 12px;">Atlas Score ${creator.atlasScore.toFixed(2)}</p>
    <div class="industry-badges">
      ${creator.content_style_tags.map((tag) => `<span class="industry-badge">${tag}</span>`).join("")}
    </div>
  `;

  const items = [
    { label: "Profile fit", value: creator.diagnostics.industryFit },
    { label: "Query overlap", value: creator.diagnostics.queryOverlap },
    { label: "Audience fit", value: creator.diagnostics.audienceFit },
    { label: "Commercial", value: creator.diagnostics.commercialIndex },
  ];

  breakdown.innerHTML = items
    .map(
      (item) => `
        <div class="score-row">
          <div class="score-row-header">
            <span>${item.label}</span>
            <strong>${(item.value * 100).toFixed(1)}</strong>
          </div>
          <div class="score-bar"><span style="width:${item.value * 100}%"></span></div>
        </div>
      `
    )
    .join("");

  help.hidden = !state.showScoreHelp;
}

function renderKpis(view) {
  const container = document.getElementById("kpiGrid");
  container.innerHTML = "";

  const scores = view.universe.all.map((creator) => creator.atlasScore).sort((a, b) => b - a);
  const topCreator = view.universe.top[0];
  const p90 = percentile(scores, 0.1);
  const totalTopTenGmv = view.universe.topTen.reduce((sum, creator) => sum + creator.metrics.total_gmv_30d, 0);
  const avgProjected = average(view.universe.all, (creator) => creator.projected_score);
  const avgEngagement = average(view.universe.all, (creator) => creator.metrics.engagement_rate);

  const cards = [
    { label: "Top candidate", value: topCreator?.username ?? "None", copy: topCreator ? `${topCreator.atlasScore.toFixed(2)} atlas score` : "No results" },
    { label: "P90 threshold", value: p90.toFixed(2), copy: "Top-decile cutoff" },
    { label: "Top 10 GMV", value: formatCurrency(totalTopTenGmv), copy: "Combined shortlist commerce" },
    { label: "Avg projected", value: avgProjected.toFixed(2), copy: "Universe projected score" },
    { label: "Avg engagement", value: formatPercent(avgEngagement), copy: "Universe engagement" },
  ];

  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "kpi-card";
    article.innerHTML = `
      <div class="kpi-label">${card.label}</div>
      <div class="kpi-value">${card.value}</div>
      <div class="detail-copy">${card.copy}</div>
    `;
    container.appendChild(article);
  });
}

function renderScoreDistribution(view) {
  const container = document.getElementById("scoreDistribution");
  const values = view.universe.all.map((creator) => creator.atlasScore);

  if (values.length === 0) {
    container.innerHTML = "<p class='detail-copy'>No data available.</p>";
    return;
  }

  const width = 700;
  const height = 240;
  const margin = { top: 18, right: 18, bottom: 28, left: 42 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const sorted = [...values].sort((a, b) => b - a);
  const minValue = Math.min(...sorted);
  const maxValue = Math.max(...sorted);
  const paddedMin = Math.max(0, minValue - 4);
  const paddedMax = Math.min(100, maxValue + 4);
  const yScale = (value) =>
    margin.top + innerHeight - ((value - paddedMin) / Math.max(paddedMax - paddedMin, 1)) * innerHeight;
  const xScale = (index) =>
    margin.left + (index / Math.max(sorted.length - 1, 1)) * innerWidth;

  const points = sorted.map((value, index) => `${xScale(index)},${yScale(value)}`).join(" ");
  const ticks = [paddedMin, (paddedMin + paddedMax) / 2, paddedMax];

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Universe score curve">
      <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="#d6dce6"></line>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" stroke="#d6dce6"></line>
      ${ticks
        .map(
          (tick) => `
            <line x1="${margin.left}" y1="${yScale(tick)}" x2="${width - margin.right}" y2="${yScale(tick)}" stroke="#eef2f6"></line>
            <text class="chart-label" x="0" y="${yScale(tick) + 4}">${tick.toFixed(0)}</text>
          `
        )
        .join("")}
      <polyline fill="none" stroke="#0f2f7a" stroke-width="2.5" points="${points}"></polyline>
      <text class="chart-label" x="${margin.left}" y="${height - 6}">Highest ranked</text>
      <text class="chart-label" x="${width - margin.right - 68}" y="${height - 6}">Long tail</text>
    </svg>
  `;
}

function renderScatterPlot(view) {
  const container = document.getElementById("scatterPlot");
  const creators = view.universe.all;

  if (creators.length === 0) {
    container.innerHTML = "<p class='detail-copy'>No data available.</p>";
    return;
  }

  const width = 700;
  const height = 240;
  const margin = { top: 16, right: 20, bottom: 30, left: 44 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxFollowers = Math.max(...creators.map((creator) => creator.metrics.follower_count), 1);
  const maxGmv = Math.max(...creators.map((creator) => creator.metrics.total_gmv_30d), 1);

  const selected = view.universe.selected;
  const topLabels = new Set(view.universe.top.slice(0, 3).map((creator) => creator.username));
  if (selected) {
    topLabels.add(selected.username);
  }

  const xScale = (value) => margin.left + normalizeLog(value, maxFollowers) * innerWidth;
  const yScale = (value) => margin.top + innerHeight - normalizeLog(value, maxGmv) * innerHeight;

  const circles = creators
    .map((creator) => {
      const isSelected = creator.username === state.selectedCreatorUsername;
      const fill = isSelected ? "#0f2f7a" : "#98a2b3";
      const radius = isSelected ? 5.5 : 3.2;
      return `<circle cx="${xScale(creator.metrics.follower_count)}" cy="${yScale(creator.metrics.total_gmv_30d)}" r="${radius}" fill="${fill}" fill-opacity="${isSelected ? 1 : 0.7}"></circle>`;
    })
    .join("");

  const labels = creators
    .filter((creator) => topLabels.has(creator.username))
    .map((creator) => {
      const x = xScale(creator.metrics.follower_count);
      const y = yScale(creator.metrics.total_gmv_30d);
      return `<text class="chart-label" x="${Math.min(x + 8, width - 120)}" y="${Math.max(y - 8, 16)}">${creator.username}</text>`;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reach versus GMV">
      <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="#d6dce6"></line>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" stroke="#d6dce6"></line>
      <text class="chart-label" x="${width - 120}" y="${height - 6}">Higher reach</text>
      <text class="chart-label" x="14" y="24" transform="rotate(-90 14,24)">Higher GMV</text>
      ${circles}
      ${labels}
    </svg>
  `;
}

function renderIndustryMix(view) {
  const container = document.getElementById("industryMix");
  container.innerHTML = "";

  const counts = new Map();
  view.universe.all.forEach((creator) => {
    creator.content_style_tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .forEach(([tag, count]) => {
      const article = document.createElement("article");
      article.className = "mix-item";
      article.innerHTML = `
        <strong>${tag}</strong>
        <div class="bar"><span style="width:${(count / view.universe.all.length) * 100}%"></span></div>
        <div class="detail-copy">${count} creators</div>
      `;
      container.appendChild(article);
    });
}

function renderSummaryRail(view) {
  const container = document.getElementById("summaryRail");
  container.innerHTML = "";

  const topGmv = [...view.universe.top].sort((a, b) => b.metrics.total_gmv_30d - a.metrics.total_gmv_30d)[0];
  const topEngagement = [...view.universe.top].sort((a, b) => b.metrics.engagement_rate - a.metrics.engagement_rate)[0];
  const bestFit = [...view.universe.top].sort((a, b) => b.diagnostics.industryFit - a.diagnostics.industryFit)[0];
  const avgAtlas = average(view.universe.topTen, (creator) => creator.atlasScore);

  const items = [
    { title: "Best profile fit", copy: bestFit ? `${bestFit.username} at ${(bestFit.diagnostics.industryFit * 100).toFixed(1)}` : "No result" },
    { title: "GMV leader", copy: topGmv ? `${topGmv.username} at ${formatCurrency(topGmv.metrics.total_gmv_30d)}` : "No result" },
    { title: "Engagement leader", copy: topEngagement ? `${topEngagement.username} at ${formatPercent(topEngagement.metrics.engagement_rate)}` : "No result" },
    { title: "Top-10 average", copy: `${avgAtlas.toFixed(2)} atlas score` },
  ];

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "summary-item";
    article.innerHTML = `
      <strong>${item.title}</strong>
      <div class="detail-copy">${item.copy}</div>
    `;
    container.appendChild(article);
  });
}

function renderLeaderboard(view) {
  const tbody = document.getElementById("leaderboardBody");
  tbody.innerHTML = "";

  view.universe.top.forEach((creator, index) => {
    const row = document.createElement("tr");
    row.className = creator.username === state.selectedCreatorUsername ? "active" : "";
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="rank-cell">
        <strong>${creator.username}</strong>
        <span class="detail-copy">${creator.bio}</span>
      </td>
      <td>
        <div class="industry-badges">
          ${creator.content_style_tags.map((tag) => `<span class="industry-badge">${tag}</span>`).join("")}
        </div>
      </td>
      <td>${creator.atlasScore.toFixed(2)}</td>
      <td>${creator.projected_score.toFixed(2)}</td>
      <td>${formatCurrency(creator.metrics.total_gmv_30d)}</td>
      <td>${formatCompactNumber(creator.metrics.avg_views_30d)}</td>
      <td>${formatPercent(creator.metrics.engagement_rate)}</td>
    `;
    row.addEventListener("click", () => {
      state.selectedCreatorUsername = creator.username;
      render();
    });
    tbody.appendChild(row);
  });
}

function quizLabel(questionId, value) {
  return (
    quizQuestions
      .find((question) => question.id === questionId)
      ?.options.find((option) => option.value === value)?.label ?? value
  );
}

function advisorScore(creator, answers) {
  let score = creator.atlasScore;

  if (answers.objective === "sales") {
    score += creator.diagnostics.commercialIndex * 24;
  } else if (answers.objective === "loyalty") {
    score += creator.diagnostics.semanticProxy * 22;
  } else if (answers.objective === "awareness") {
    score += creator.diagnostics.followersNorm * 18 + creator.diagnostics.viewsNorm * 14;
  }

  if (answers.voice === "technical" && (
    creator.content_style_tags.includes("Phones & Electronics") ||
    creator.content_style_tags.includes("Computer & Office Equipment") ||
    creator.content_style_tags.includes("Tools & Hardware")
  )) {
    score += 16;
  }

  if (answers.voice === "lifestyle" && (
    creator.content_style_tags.includes("Home") ||
    creator.content_style_tags.includes("Beauty") ||
    creator.content_style_tags.includes("Food & Beverage") ||
    creator.content_style_tags.includes("Fashion")
  )) {
    score += 16;
  }

  if (answers.voice === "trend") {
    score += creator.metrics.engagement_rate / 0.12 * 14;
  }

  if (answers.rollout === "broad") {
    score += creator.diagnostics.followersNorm * 16;
  } else if (answers.rollout === "balanced") {
    score += creator.diagnostics.commercialIndex * 12;
  } else if (answers.rollout === "niche") {
    score += creator.diagnostics.audienceFit * 16;
  }

  return score;
}

function renderAdvisor(view) {
  const quizMount = document.getElementById("quizMount");
  const advisorOutput = document.getElementById("advisorOutput");

  if (!state.quizStarted) {
    quizMount.innerHTML = `
      <div class="panel-label">Walkthrough</div>
      <h3>Would you like to take a quiz?</h3>
      <p class="detail-copy">Answer three quick prompts to turn the current screen into a campaign plan.</p>
      <button class="quiz-button primary" id="startQuizButton" type="button">Start</button>
    `;

    advisorOutput.innerHTML = `
      <div class="panel-label">Output</div>
      <h3>Campaign recommendation</h3>
      <p class="detail-copy">The recommendation set will appear here once the quiz is complete.</p>
    `;

    document.getElementById("startQuizButton").addEventListener("click", () => {
      state.quizStarted = true;
      state.quizStep = 0;
      state.quizAnswers = {};
      render();
    });
    return;
  }

  const question = quizQuestions[state.quizStep];
  const selected = state.quizAnswers[question.id];

  quizMount.innerHTML = `
    <div class="panel-label">Question ${state.quizStep + 1} of ${quizQuestions.length}</div>
    <h3>${question.prompt}</h3>
    <div class="quiz-options">
      ${question.options
        .map(
          (option) => `
            <button class="quiz-option ${selected === option.value ? "selected" : ""}" data-value="${option.value}" type="button">
              ${option.label}
            </button>
          `
        )
        .join("")}
    </div>
    <div style="margin-top:12px">
      <button class="quiz-button secondary" id="resetQuizButton" type="button">Reset</button>
    </div>
  `;

  document.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => {
      state.quizAnswers[question.id] = button.dataset.value;
      if (state.quizStep < quizQuestions.length - 1) {
        state.quizStep += 1;
      }
      render();
    });
  });

  document.getElementById("resetQuizButton").addEventListener("click", () => {
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    render();
  });

  if (Object.keys(state.quizAnswers).length === quizQuestions.length) {
    const picks = [...view.universe.top]
      .map((creator) => ({ creator, score: advisorScore(creator, state.quizAnswers) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.creator);

    advisorOutput.innerHTML = `
      <div class="panel-label">Output</div>
      <h3>${view.profileDetail.label}: ${quizLabel("objective", state.quizAnswers.objective)}</h3>
      <div class="advisor-badges">
        <span class="advisor-badge">${quizLabel("objective", state.quizAnswers.objective)}</span>
        <span class="advisor-badge">${quizLabel("voice", state.quizAnswers.voice)}</span>
        <span class="advisor-badge">${quizLabel("rollout", state.quizAnswers.rollout)}</span>
      </div>
      <div class="advisor-list">
        ${picks
          .map(
            (creator, index) => `
              <article class="advisor-pick">
                <strong>${index + 1}. ${creator.username}</strong>
                <div class="detail-copy">${creator.bio}</div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  } else {
    advisorOutput.innerHTML = `
      <div class="panel-label">Output</div>
      <h3>Waiting for inputs</h3>
      <div class="detail-copy">Complete the quiz to generate a recommendation.</div>
    `;
  }
}

function attachEvents() {
  document.getElementById("profileSelect").addEventListener("change", (event) => {
    state.selectedProfileId = event.target.value;
    state.quizStarted = false;
    state.quizStep = 0;
    state.quizAnswers = {};
    render();
  });

  document.getElementById("industrySelect").addEventListener("change", (event) => {
    state.selectedIndustry = event.target.value;
    render();
  });

  document.getElementById("typeSearch").addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    render();
  });

  document.getElementById("toggleScoreHelp").addEventListener("click", () => {
    state.showScoreHelp = !state.showScoreHelp;
    render();
  });
}

function render() {
  const view = getCurrentView();
  renderControls(view);
  renderMeta(view);
  renderSelectedCreator(view);
  renderKpis(view);
  renderScoreDistribution(view);
  renderScatterPlot(view);
  renderIndustryMix(view);
  renderSummaryRail(view);
  renderLeaderboard(view);
  renderAdvisor(view);
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load dashboard data (${response.status})`);
    }

    dashboardData = await response.json();
    attachEvents();
    render();
  } catch (error) {
    document.body.innerHTML = `
      <main class="app-shell">
        <section class="rail-card">
          <h1>Dashboard unavailable</h1>
          <p class="detail-copy">${error instanceof Error ? error.message : "Unknown loading error"}</p>
        </section>
      </main>
    `;
  }
}

init();
