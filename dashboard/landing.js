const DATA_PATH = "/api/dashboard-data";

function animateCount(element, targetValue) {
  const durationMs = 1200;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / durationMs, 1);
    const eased = 1 - (1 - progress) ** 3;
    const current = Math.round(targetValue * eased);
    element.textContent = String(current);

    if (progress < 1) {
      window.requestAnimationFrame(tick);
    }
  }

  window.requestAnimationFrame(tick);
}

function setupRevealAnimations() {
  const revealNodes = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

async function initLanding() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load landing metrics.");
    }

    const data = await response.json();

    const creatorCount = document.getElementById("heroCreatorCount");
    const profileCount = document.getElementById("heroProfileCount");

    if (creatorCount) {
      creatorCount.dataset.count = String(data.creators.length);
      animateCount(creatorCount, data.creators.length);
    }

    if (profileCount) {
      profileCount.dataset.count = String(data.brandProfiles.length);
      animateCount(profileCount, data.brandProfiles.length);
    }

    document.querySelectorAll("[data-count]").forEach((element) => {
      const target = Number(element.dataset.count);
      if (Number.isFinite(target) && !element.id) {
        animateCount(element, target);
      }
    });
  } catch (error) {
    console.error(error);
  }
}

setupRevealAnimations();
initLanding();
