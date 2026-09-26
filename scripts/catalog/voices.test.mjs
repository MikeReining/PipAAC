import assert from "node:assert/strict";
import { test } from "node:test";

import { getBackupVoice, getPrimaryVoice, loadCatalogVoices } from "./voices.mjs";

test("catalog voices.json defines Grok primary and ElevenLabs backup", () => {
  const doc = loadCatalogVoices();
  assert.equal(doc.primary.provider, "xai");
  assert.equal(doc.primary.voice_id, "ara");
  assert.equal(doc.backup.provider, "elevenlabs");
  assert.equal(doc.backup.voice_id, "paOIq6PwrBInRivGXL1u");
  assert.equal(getBackupVoice(doc).label, "Aga");
  assert.equal(getPrimaryVoice(doc).voice_id, "ara");
});
