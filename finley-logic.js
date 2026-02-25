/* ============================================================
   finley-logic.js — Change Enablement Agent
   Implements classification, risk assessment, and approval path
   logic directly from SKILL.md Sections 1, 2, and 4.
   ============================================================ */

/* ── Section 1.3: Change Classification ─────────────────────
   Decision tree (verbatim from SKILL.md §1):
     Is service currently down or critically degraded?
     ├── YES → Is this change the fix? → YES → EMERGENCY
     │                                  → NO  → raise incident first, then NORMAL
     ├── NO  → Is this a pre-approved change model?
     │         ├── YES → STANDARD
     │         └── NO  → NORMAL (assess risk tier below)
   ─────────────────────────────────────────────────────────── */
function classifyChange(serviceDown, preApproved) {
  if (serviceDown === 'yes') {
    // Service is down — treat the submitted change as the fix (Emergency)
    return 'Emergency';
  }
  // Service is NOT down
  if (preApproved === 'yes') {
    return 'Standard';
  }
  return 'Normal';
}

/* ── Section 2.2: Risk Score Calculation ─────────────────────
   risk_score = sum(all_dimensions) / number_of_dimensions
   Composite Score → Risk Tier:
     1.0 – 2.0  →  Low    (Peer review)
     2.1 – 3.5  →  Medium (Change authority)
     3.6 – 5.0  →  High   (Full CAB)
   ─────────────────────────────────────────────────────────── */
function assessRisk(dimensions) {
  // dimensions: array of 7 integers, each 1–5
  const sum = dimensions.reduce(function (acc, val) { return acc + val; }, 0);
  const composite = sum / dimensions.length;

  var tier;
  if (composite <= 2.0) {
    tier = 'Low';
  } else if (composite <= 3.5) {
    tier = 'Medium';
  } else {
    tier = 'High';
  }

  return {
    composite: parseFloat(composite.toFixed(2)),
    tier: tier
  };
}

/* ── Section 4: Approval Workflows ──────────────────────────
   Returns an HTML string describing the full workflow for the
   given change type and (for Normal) risk tier.
   ─────────────────────────────────────────────────────────── */
function getApprovalPath(changeType, riskTier) {
  if (changeType === 'Standard') {
    // §4.1 Standard Change Flow
    return (
      '<ol>' +
        '<li>Requester triggers pipeline</li>' +
        '<li>Automated pre-checks (lint, test, scan)</li>' +
        '<li>Auto-approved — change model match verified</li>' +
        '<li>Deploy</li>' +
        '<li>Automated validation</li>' +
        '<li>Change record logged automatically</li>' +
      '</ol>' +
      '<p class="lead-time">Lead time target: Minutes to hours (automated pipeline)</p>'
    );
  }

  if (changeType === 'Emergency') {
    // §4.5 Emergency Change Flow
    return (
      '<ol>' +
        '<li>Incident declared</li>' +
        '<li>Emergency RFC created (minimal fields)</li>' +
        '<li>ECAB approval (phone / chat, 2 approvers minimum)</li>' +
        '<li>Implement immediately</li>' +
        '<li>Validate service restored</li>' +
        '<li>Retrospective RFC completion (within 48 h)</li>' +
        '<li>Mandatory Post-Implementation Review (PIR)</li>' +
      '</ol>' +
      '<p class="lead-time">Lead time target: As fast as safely possible</p>'
    );
  }

  // Normal — branch by risk tier
  if (riskTier === 'Low') {
    // §4.2 Normal Change Flow (Low Risk)
    return (
      '<ol>' +
        '<li>Requester submits RFC</li>' +
        '<li>Automated risk scoring</li>' +
        '<li>Peer review (1 reviewer, async)</li>' +
        '<li>Approved &rarr; Scheduled in change calendar</li>' +
        '<li>Deploy in approved window</li>' +
        '<li>Validation</li>' +
        '<li>Close RFC</li>' +
      '</ol>' +
      '<p class="lead-time">Lead time target: 1–2 business days</p>'
    );
  }

  if (riskTier === 'Medium') {
    // §4.3 Normal Change Flow (Medium Risk)
    return (
      '<ol>' +
        '<li>Requester submits RFC</li>' +
        '<li>Automated risk scoring</li>' +
        '<li>Technical review (architect or senior engineer)</li>' +
        '<li>Change authority approval</li>' +
        '<li>Scheduled in change calendar (with conflict check)</li>' +
        '<li>Deploy with monitoring</li>' +
        '<li>Validation + brief PIR</li>' +
        '<li>Close RFC</li>' +
      '</ol>' +
      '<p class="lead-time">Lead time target: 2–3 business days</p>'
    );
  }

  // High risk — §4.4 Normal Change Flow (High Risk)
  return (
    '<ol>' +
      '<li>Requester submits RFC</li>' +
      '<li>Automated risk scoring</li>' +
      '<li>Technical review + security review</li>' +
      '<li>Pre-CAB: documentation completeness check</li>' +
      '<li>CAB review (weekly cadence or ad-hoc)</li>' +
      '<li>Senior management sign-off</li>' +
      '<li>Scheduled with communication plan</li>' +
      '<li>Deploy with war-room / bridge call</li>' +
      '<li>Validation + full PIR</li>' +
      '<li>Close RFC</li>' +
    '</ol>' +
    '<p class="lead-time">Lead time target: 3–5 business days</p>'
  );
}

/* ── DOM references ──────────────────────────────────────── */
var changeForm        = document.getElementById('change-form');
var resultsSection    = document.getElementById('results-section');

var classificationOutput = document.getElementById('classification-output');

var riskSlidersCard   = document.getElementById('risk-sliders-card');
var calcRiskBtn       = document.getElementById('calc-risk-btn');

var riskScoreCard     = document.getElementById('risk-score-card');
var compositeScoreEl  = document.getElementById('composite-score');
var riskTierEl        = document.getElementById('risk-tier');

var approvalCard      = document.getElementById('approval-card');
var approvalOutput    = document.getElementById('approval-output');

var mitigationCard    = document.getElementById('mitigation-card');

// Slider IDs and their matching live-value display IDs
var sliderIds = [
  'dim-impact',
  'dim-complexity',
  'dim-reversibility',
  'dim-testing',
  'dim-history',
  'dim-timing',
  'dim-dependencies'
];

var valueDisplayIds = [
  'val-impact',
  'val-complexity',
  'val-reversibility',
  'val-testing',
  'val-history',
  'val-timing',
  'val-dependencies'
];

/* ── Helpers ─────────────────────────────────────────────── */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function getRadioValue(name) {
  var checked = document.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : null;
}

function setBadgeClass(el, base, type) {
  // Remove any previous badge class and apply the new one
  el.className = base + ' ' + type;
}

/* ── Slider live-value display ───────────────────────────── */
sliderIds.forEach(function (sliderId, index) {
  var slider   = document.getElementById(sliderId);
  var valueEl  = document.getElementById(valueDisplayIds[index]);
  slider.addEventListener('input', function () {
    valueEl.textContent = slider.value;
  });
});

/* ── Form submit: classify the change ────────────────────── */
changeForm.addEventListener('submit', function (e) {
  e.preventDefault();

  var description = document.getElementById('change-description').value.trim();
  var affectedSys = document.getElementById('affected-system').value;
  var serviceDown = getRadioValue('service-down');
  var preApproved = getRadioValue('pre-approved');

  // Validate all fields are filled
  if (!description || !affectedSys || !serviceDown || !preApproved) {
    alert('Please complete all fields before submitting.');
    return;
  }

  var changeType = classifyChange(serviceDown, preApproved);

  // Reset all result cards to hidden first
  hide(riskSlidersCard);
  hide(riskScoreCard);
  hide(approvalCard);
  hide(mitigationCard);

  // Show and populate the classification badge
  classificationOutput.textContent = changeType;
  var badgeClass = {
    Standard:  'classification-badge badge-standard',
    Normal:    'classification-badge badge-normal',
    Emergency: 'classification-badge badge-emergency'
  }[changeType];
  classificationOutput.className = badgeClass;

  if (changeType === 'Normal') {
    // Show sliders; approval path shown after risk is calculated
    show(riskSlidersCard);
    approvalOutput.innerHTML =
      '<p>Set the sliders above and click <strong>Calculate Risk Score</strong> to see the approval path.</p>';
    show(approvalCard);
    // Mitigation checklist is always shown — reset checkboxes
    resetChecklist();
    show(mitigationCard);
  } else {
    // Standard or Emergency: no sliders needed
    approvalOutput.innerHTML = getApprovalPath(changeType, null);
    show(approvalCard);
    resetChecklist();
    show(mitigationCard);
  }

  show(resultsSection);
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ── Assess Risk button ──────────────────────────────────── */
calcRiskBtn.addEventListener('click', function () {
  var dimensions = sliderIds.map(function (id) {
    return parseInt(document.getElementById(id).value, 10);
  });

  var result = assessRisk(dimensions);

  // Populate score
  compositeScoreEl.textContent = result.composite.toFixed(2);

  // Populate tier badge
  riskTierEl.textContent = result.tier;
  var tierClass = {
    Low:    'risk-tier-badge tier-low',
    Medium: 'risk-tier-badge tier-medium',
    High:   'risk-tier-badge tier-high'
  }[result.tier];
  riskTierEl.className = tierClass;

  show(riskScoreCard);

  // Now we know the tier — render the full Normal approval path
  approvalOutput.innerHTML = getApprovalPath('Normal', result.tier);

  riskScoreCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ── Utility: reset mitigation checklist checkboxes ─────── */
function resetChecklist() {
  var boxes = mitigationCard.querySelectorAll('input[type="checkbox"]');
  boxes.forEach(function (box) { box.checked = false; });
}
