export type BriefingAudioMetadata = {
  provider: "cached";
  cached: true;
  url?: string;
  localPath?: string;
};

export function getCachedBriefingAudioMetadata(): BriefingAudioMetadata | null {
  const url = process.env.FOUNDER_BRIEFING_AUDIO_URL;
  const localPath = process.env.FOUNDER_BRIEFING_AUDIO_PATH;

  if (!url && !localPath) {
    return null;
  }

  return {
    provider: "cached",
    cached: true,
    ...(url ? { url } : {}),
    ...(localPath ? { localPath } : {})
  };
}
