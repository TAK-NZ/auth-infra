#!/usr/bin/env node
/**
 * Render the enrollment page's "TAK Mobile Apps" section to a local HTML file for
 * visual inspection, using the real EJS partials and the real page stylesheets
 * (including the bundled Bootstrap) so it matches what the Lambda serves.
 *
 * Usage:  npm run preview:enrollment
 * Output: tools/preview/enrollment-store-badges.html  (gitignored)
 *
 * Why this exists: the badge layout and the "Recommended option" star alignment depend
 * on the page's real font stack and line-height, which come from Bootstrap. Rendering
 * the partials in isolation gives misleading results.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const REPO = path.resolve(__dirname, '../..');
const LAMBDA = path.join(REPO, 'src/enrollment-lambda');
const VIEWS = path.join(LAMBDA, 'views');
const OUT = path.join(__dirname, 'enrollment-store-badges.html');

// ejs is a dependency of the Lambda, not of the CDK project root.
let ejs;
try {
  ejs = createRequire(path.join(LAMBDA, 'package.json'))('ejs');
} catch (err) {
  console.error('Could not load ejs. Run:  cd src/enrollment-lambda && npm install');
  process.exit(1);
}

function render(rel, locals) {
  const file = path.join(VIEWS, rel);
  return ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file });
}

const locals = {
  branding: 'tak-nz',
  title: 'TAK Device Enrollment (preview)',
  heading: 'Device Enrollment',
  footer: '<em>Local preview &mdash; not the deployed page.</em>',
};

// Pull the star SVG straight out of the partial so the comparison panel can never
// drift from what the page actually renders.
const badgesSrc = fs.readFileSync(path.join(VIEWS, 'partials/store_badges.ejs'), 'utf8');
const starMatch = badgesSrc.match(/const recommendedIcon = `([\s\S]*?)`;/);
const star = starMatch ? starMatch[1] : '';

const ALIGNMENTS = [
  ['vertical-align: super', 'display:inline-block;line-height:0;vertical-align:super', 'IN USE — superscript, raised like a footnote marker'],
  ['vertical-align: text-top', 'display:inline-block;line-height:0;vertical-align:text-top', 'aligned to the top of the text'],
  ['vertical-align: baseline', 'display:inline-block;line-height:0;vertical-align:baseline', 'icon box bottom on the text baseline'],
  ['vertical-align: middle', 'display:inline-flex;align-items:center;vertical-align:middle', 'original — centred, hangs below the baseline'],
];

const comparison = `
<div class="form-group" style="margin-top:40px">
  <label class="text-info">Star alignment options</label><br>
  <span style="font-size:13px;color:#555">
    Each sample is the real label markup under the real page styles. "ATAK" is all-caps,
    so the bottom of the letters <em>is</em> the baseline &mdash; compare the star against it
    directly. Samples are shown at 3&times; underneath for easier judgement.
  </span>
</div>
<div style="max-width:600px;margin:0 auto">
${ALIGNMENTS.map(([name, css, note], i) => `
  <div class="align-sample" style="margin:0 0 14px;padding:10px 12px;border:1px solid #ddd;background:#fff">
    <div style="font:12px/1.4 monospace;color:#0a58ca">${name}</div>
    <div style="font-size:11px;color:#666;margin-bottom:6px">${note}</div>
    <div class="app-name sample-1x" style="font-size:16px">
      <strong>ATAK</strong><span class="sample-star"
        style="color:#f0ad4e;${css}">${star}</span>
    </div>
    <div style="margin-top:8px;border-top:1px dashed #eee;padding-top:8px">
      <div style="font-size:10px;color:#999;margin-bottom:2px">3&times;</div>
      <div class="app-name sample-3x" style="font-size:48px">
        <strong>ATAK</strong><span
          style="color:#f0ad4e;${css}">${star.replace('width="14" height="14"', 'width="42" height="42"')}</span>
      </div>
    </div>
  </div>`).join('')}
</div>`;

const html = [
  render('partials/header.ejs', locals),
  render('partials/store_badges.ejs', locals),
  comparison,
  render('partials/footer.ejs', locals),
].join('\n');

fs.writeFileSync(OUT, html);
console.log('Preview written to:', OUT);
console.log('Open in a browser:  file://' + OUT);
