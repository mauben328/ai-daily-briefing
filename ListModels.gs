/**
 * Utility: lists the Gemini models available to your API key that support
 * text generation. Run this once from the Apps Script editor (View > Logs)
 * to pick a value for the GEMINI_MODEL script property.
 */
function checkMyAvailableModels() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    Logger.log("GEMINI_API_KEY property is missing. Add it under Project Settings > Script Properties.");
    return;
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models";
  const response = UrlFetchApp.fetch(url, {
    headers: { "x-goog-api-key": apiKey },
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText());

  Logger.log("=== AVAILABLE MODELS ===");
  (data.models || []).forEach(model => {
    // Only log models that support text generation
    if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes("generateContent")) {
      Logger.log(model.name);
    }
  });
}
