export function getUserTranscriptItems(items) {
  return Array.isArray(items)
    ? items.filter(item => item.metadata?.object === 'user.transcription')
    : [];
}

export function isTranscriptInProgress(item) {
  const status = item?.status ?? item?.metadata?.turn_status;
  if (status !== undefined) {
    return status === 0 || status === 'IN_PROGRESS';
  }
  return item?.metadata?.final === false;
}

export function isFinalTranscript(item) {
  const status = item?.status ?? item?.metadata?.turn_status;
  if (status !== undefined) {
    return status === 1 || status === 'END';
  }
  return item?.metadata?.final === true;
}
