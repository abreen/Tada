function isFeatureEnabled(siteVariables, featureName) {
  return siteVariables.features?.[featureName] !== false;
}

module.exports = { isFeatureEnabled };
