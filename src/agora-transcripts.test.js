import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUserTranscriptItems,
  isFinalTranscript,
  isTranscriptInProgress
} from './agora-transcripts.js';

test('keeps Agora user transcripts with its synthetic UID', () => {
  const userTranscript = {
    uid: '0',
    metadata: { object: 'user.transcription', final: true }
  };
  const agentTranscript = {
    uid: '1002',
    metadata: { object: 'assistant.transcription', final: true }
  };

  assert.deepEqual(getUserTranscriptItems([agentTranscript, userTranscript]), [userTranscript]);
});

test('recognizes Agora END status as a completed user turn', () => {
  const completed = {
    uid: '0',
    status: 1,
    metadata: { object: 'user.transcription', turn_status: 1 }
  };
  const interim = {
    uid: '0',
    status: 0,
    metadata: { object: 'user.transcription', turn_status: 0 }
  };

  assert.equal(isFinalTranscript(completed), true);
  assert.equal(isTranscriptInProgress(completed), false);
  assert.equal(isFinalTranscript(interim), false);
  assert.equal(isTranscriptInProgress(interim), true);
});

test('uses Agora turn_status metadata when top-level status is unavailable', () => {
  const completed = {
    metadata: { object: 'user.transcription', turn_status: 1 }
  };

  assert.equal(isFinalTranscript(completed), true);
});
