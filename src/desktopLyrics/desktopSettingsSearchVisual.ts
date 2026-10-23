import type { VisualizerBackgroundMode, VisualizerMode } from '../types';

// src/desktopLyrics/desktopSettingsSearchVisual.ts — explicit panel labels, including parameters hidden by mode or prerequisites.
type VisualCatalog = { mode: VisualizerMode; labelKey: string; keys: readonly string[] };
type BackgroundCatalog = { background: VisualizerBackgroundMode; labelKey: string; keys: readonly string[] };
const options = (names: string) => names.split(/\s+/).filter(Boolean).map(name => `options.${name}`);

export const DESKTOP_MODE_SEARCH_CATALOG: VisualCatalog[] = [
  { mode: 'classic', labelKey: 'ui.visualizerClassic', keys: options(`classicSettings classicWordRotation classicLegacyLayout
    classicBreathingFloatMultiplier classicWordSpacing`) },
  { mode: 'cadenza', labelKey: 'ui.visualizerCadenze', keys: [] },
  { mode: 'partita', labelKey: 'ui.visualizerPartita', keys: options(`partitaSettings partitaGuideLines partitaSemanticLayout
    partitaStaggerMin partitaStaggerMax`) },
  { mode: 'fume', labelKey: 'ui.visualizerFume', keys: options(`fumeSettings fumeHidePrintSymbols fumeGeometricBackground
    fumeBackgroundObjectOpacity fumeTextHoldRatio fumeCameraSpeed fumeCameraTrackingMode fumeGlowIntensity fumeHeroScale`) },
  { mode: 'claddagh', labelKey: 'ui.visualizerCladdagh', keys: options(`claddaghSettings claddaghShowAxisLine claddaghFocusScaleRatio
    claddaghRadiusScale claddaghEllipseTiltDeg claddaghLetterSpacingOffset`) },
  { mode: 'cappella', labelKey: 'ui.visualizerCappella', keys: options(`cappellaSettings cappellaAvatarSource cappellaAvatarUpload
    cappellaAvatarClear cappellaShowEmoMessages cappellaEmojiSource cappellaEmojiUpload cappellaEmojiClear`) },
  { mode: 'tilt', labelKey: 'ui.visualizerTilt', keys: options(`tiltSettings tiltSplitProbability tiltStyleProbability tiltColorScheme`) },
  { mode: 'diorama', labelKey: 'ui.visualizerDiorama', keys: options(`dioramaSettings dioramaCameraSpeed dioramaAudioReactivity
    dioramaMotionAmount dioramaGeometry dioramaGeometryMode dioramaGeometryStrands dioramaGeometryRings dioramaGeometryBlobs
    dioramaGeometryRibbons dioramaParticleScale dioramaParticleDensity dioramaParticleGlow dioramaParticleGlowIntensity
    dioramaGradientEffect dioramaGlowEffect dioramaSoulEffect dioramaSoulActiveEffect dioramaKeywordColoring
    dioramaShowParticles dioramaMoteCircumference dioramaMoteRadial dioramaEffectStrength dioramaCustomStrength`) },
  { mode: 'pendolo', labelKey: 'ui.visualizerPendolo', keys: options(`pendoloWheelCenterX pendoloArcRadius pendoloArcAngleDeg
    pendoloTickSnappiness pendoloActiveScale pendoloShowGearDecor pendoloShowCenterGradient pendoloShowCoverOnWatchFace pendoloEnableLineGlow`) },
  { mode: 'monet', labelKey: 'ui.visualizerMonet', keys: options(`lyricsStyleSettings monetFontScale monetKeywordColoring
    cappellaAvatarSource monetPortraitSource monetPortraitStyle monetPortraitDragHanger monetUploadPortrait monetClearPortrait
    monetShowAudioVisualization monetAudioStyle monetShowDescription`) },
  { mode: 'sonnet', labelKey: 'ui.visualizerSonnet', keys: options(`sonnetQualitySection sonnetTextureResolution
    sonnetMotionSection sonnetCameraIntensity sonnetTypographyMotion sonnetOuterFrameMode sonnetMgDensity
    sonnetPostProcessSection sonnetPostProcessEnabled sonnetPostProcessGrain sonnetPostProcessContrast sonnetPostProcessRgbShift
    sonnetPostProcessVignette sonnetPostProcessHalftone sonnetPostProcessLensDistortion sonnetPostProcessLensDispersion
    sonnetDisplaySection sonnetShowBackgroundMg sonnetShowBackgroundDecor sonnetShowFixedGeo sonnetShowOnlyText
    sonnetShowGuide sonnetShowGiantDecorativeText sonnetEnableTransitions`) },
  { mode: 'tempera', labelKey: 'ui.visualizerTempera', keys: options(`temperaImageSection temperaQualitySection
    temperaTextureResolution temperaMotionSection temperaCameraIntensity temperaGlyphMotion temperaGlyphSettleStretch
    temperaColorMode temperaPostProcessSection temperaPostProcessEnabled temperaPostProcessTextureCompression
    temperaPostProcessGrain temperaPostProcessContrast temperaPostProcessRgbShift temperaPostProcessVignette temperaPostProcessLensDistortion
    temperaLyricSection temperaWholeLineLyrics temperaDisplaySection temperaShowBlocks temperaShowDecor
    temperaShowCornerMarks temperaTextInversion temperaEnableTransitions temperaAddLayerImage temperaClearLayerImages
    temperaExportImages temperaImportImages temperaImportAppendImages temperaImportReplaceImages temperaLayerImageDepth
    temperaLayerImageFrequency temperaLayerAlignVerticalRandom temperaLayerAlignHorizontalRandom temperaLayerAlignFree
    temperaLayerImageScale temperaLayerImageOpacity temperaRemoveLayerImage temperaLayerImageSave`) },
  { mode: 'lumiere', labelKey: 'ui.visualizerLumiere', keys: options(`lumiereLightSection lumiereLightIntensity
    lumiereAudioResponse lumiereBloom lumiereTextBloom lumiereAtmosphereSection lumiereDarkField lumiereFogDensity lumiereFogOctaves
    lumiereMoteAmount lumiereFrontBokeh lumiereLineArt lumiereOverlayFrame lumiereTextSection lumiereTextOnly lumiereUnlitOpacity
    lumiereWindowNeighbors lumiereDecay lumiereEcho lumiereTrails lumiereHideTrails lumiereSeamlessTransitions lumiereThemeSection lumiereThemeColorMix
    lumiereKeywordColors lumiereThemeIcons lumierePerformanceSection lumiereRenderQuality`) },
  { mode: 'hanabi', labelKey: 'ui.visualizerHanabi', keys: options(`hanabiFireworksSection hanabiStageSection hanabiTextSection
    hanabiDecorSection hanabiColorSection hanabiPerformanceSection hanabiSparkAmount hanabiGlow hanabiChorusBloom hanabiBloom
    hanabiLaunches hanabiSky hanabiRiseSpeed hanabiSpin hanabiAmbient hanabiOverlayFrame hanabiTextOnly hanabiTextMotion
    hanabiBlockOpacity hanabiCollage hanabiOrnamentAmount hanabiColorMode hanabiRenderQuality`) },
  { mode: 'still', labelKey: 'ui.visualizerStill', keys: [] },
];

export const DESKTOP_BACKGROUND_SEARCH_CATALOG: BackgroundCatalog[] = [
  { background: 'common', labelKey: 'options.visualizerBackgroundModeCommon', keys: [
    ...options(`disableVisualizerVignette disableVisualizerGeometricBackground previewCoverBackgroundSettings previewCoverBackgroundOpacity`),
    'theme.addCoverColor',
  ] },
  { background: 'monet', labelKey: 'options.visualizerBackgroundModeMonet', keys: options(`monetGroupBackgroundSource monetBackgroundSource monetUploadBackground monetClearBackground monetGroupLayoutPosition
    monetBackgroundLayout monetHalfPaneOffsetX monetGroupColorTintWash monetBackgroundOverlayOpacity monetBackgroundWash
    monetBackgroundWashColorMode monetBackgroundWashCustomColor monetGroupFiltersPostProcessing monetBackgroundBlur
    monetBackgroundGrayscale monetBackgroundSaturation monetBackgroundDriftEnabled monetBackgroundDriftStrength monetBackgroundStreaksEnabled`) },
  { background: 'nomand', labelKey: 'options.visualizerBackgroundModeNomand', keys: options(`nomandBackgroundSettings
    nomandBackgroundSource monetUploadBackground monetClearBackground nomandBackgroundOverlay nomandBackgroundOverlayOpacity
    nomandBackgroundEffect nomandBackgroundEffectDithering nomandBackgroundDitheringType nomandBackgroundSize
    nomandBackgroundColorSteps nomandBackgroundOriginalColors nomandBackgroundInverted nomandBackgroundEffectFlutedGlass
    nomandBackgroundFlutedGlassSize nomandBackgroundFlutedGlassDistortion nomandBackgroundFlutedGlassBlur
    nomandBackgroundEffectPaperTexture nomandBackgroundPaperTextureContrast nomandBackgroundPaperTextureRoughness
    nomandBackgroundPaperTextureFiber nomandBackgroundEffectHalftoneDots nomandBackgroundHalftoneDotsSize
    nomandBackgroundHalftoneDotsRadius nomandBackgroundHalftoneDotsContrast nomandBackgroundEffectLensDistortion
    nomandBackgroundLensDistortionSpread nomandBackgroundLensDistortionBulge nomandBackgroundLensDistortionDispersion`) },
  { background: 'latent', labelKey: 'options.visualizerBackgroundModeLatent', keys: options(`latentBackgroundSettings
    latentDisplayMode latentColorSource latentDynamicOnlyInPlayer latentEnhancedBeatResponse nomandBackgroundOverlay
    nomandBackgroundOverlayOpacity latentDitheringGroup latentDitheringSize
    latentDitheringOpacity latentMeshGroup latentMeshDistortion latentMeshSwirl`) },
  { background: 'url', labelKey: 'options.visualizerBackgroundModeUrl', keys: options(`urlBackgroundSettings urlBackgroundAdd urlBackgroundNotePlaceholder`) },
  { background: 'sora', labelKey: 'options.visualizerBackgroundModeSora', keys: options(`soraBackgroundSettings soraBlank`) },
];

// Conditions describe a safe landing point; navigation opens disclosures without changing the stored effect.
export function desktopVisualSearchCondition(labelKey: string, mode?: VisualizerMode, background?: VisualizerBackgroundMode) {
  if (mode === 'classic' && labelKey === 'options.classicWordSpacing') return { fallbackKey: 'options.classicLegacyLayout' };
  if (mode && ['tempera', 'sonnet'].includes(mode) && labelKey.startsWith(`options.${mode}PostProcess`)
    && !labelKey.endsWith('Section') && !labelKey.endsWith('Enabled')) return { fallbackKey: `options.${mode}PostProcessEnabled` };
  if (mode === 'tempera' && /tempera(?:Layer|ClearLayer|ExportImages|ImportImages|ImportAppend|ImportReplace|RemoveLayer)/.test(labelKey))
    return { fallbackKey: 'options.temperaImageSection' };
  if (mode === 'diorama') {
    if (/diorama(?:Geometry(?!$)|Particle)/.test(labelKey)) return { contextKey: 'options.dioramaGeometry', fallbackKey: 'options.dioramaGeometry' };
    if (/dioramaMote/.test(labelKey)) return { contextKey: 'options.dioramaShowParticles', fallbackKey: 'options.dioramaShowParticles' };
    if (labelKey === 'options.dioramaSoulActiveEffect') return { contextKey: 'options.dioramaSoulEffect', fallbackKey: 'options.dioramaSoulEffect' };
  }
  if (background === 'monet' && labelKey === 'options.monetBackgroundWashCustomColor') return { fallbackKey: 'options.monetBackgroundWashColorMode' };
  if (background === 'monet' && labelKey === 'options.monetHalfPaneOffsetX') return { fallbackKey: 'options.monetBackgroundLayout' };
  if (background === 'monet' && labelKey === 'options.monetBackgroundDriftStrength') return { fallbackKey: 'options.monetBackgroundDriftEnabled' };
  if (background === 'url' && labelKey === 'options.urlBackgroundNotePlaceholder') return { fallbackKey: 'options.urlBackgroundAdd' };
  if (background === 'nomand') {
    for (const effect of ['FlutedGlass', 'PaperTexture', 'HalftoneDots', 'LensDistortion'])
      if (labelKey.startsWith(`options.nomandBackground${effect}`)) return { fallbackKey: `options.nomandBackgroundEffect${effect}` };
    if (/nomandBackground(?:Dithering|Size|ColorSteps)/.test(labelKey)) return { fallbackKey: 'options.nomandBackgroundEffectDithering' };
  }
  return {};
}
