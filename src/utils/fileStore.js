const fs = require('fs-extra');
const path = require('path');
const CustomLogger = require('../logger');

const resultsPath = path.join(__dirname, '../../results.json');

function loadResults() {
  try {
    if (fs.existsSync(resultsPath)) {
      return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    }
  } catch (err) {
    CustomLogger.warn(`Error loading results: ${err.message}`);
  }
  return {};
}

function saveResults(results) {
  try {
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 4));
  } catch (err) {
    CustomLogger.error(`Error saving results: ${err.message}`);
  }
}

module.exports = { loadResults, saveResults };
