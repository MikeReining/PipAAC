/**
 * The voice picker facade (phase 044 D3): Settings -> Talking -> Voice.
 * Exported as PIPCORE.voicepick. The web's own rules, rendered for Swift:
 * which voices exist and their words come from shared/voices.mjs
 * (voice-ui.js mountVoice); the sample is board.js sampleVoice's
 * word-clip path ("I", "want", "apple" in the voice being previewed).
 * Choosing writes learner_profile.preferred_voice_id through
 * appSetSetting (the synced path) - Swift calls that after the pack is
 * verified, never before. Swift owns the files (VoicePacks.swift).
 */
import { voiceChoices, voiceName } from "../../public/shared/voices.mjs";
import { resolveProfile } from "../../public/shared/profile.mjs";
import { resolveSlot } from "../../public/shared/voice.mjs";
import { appDb } from "./app.mjs";

const all = (db, sql, p = []) => db.prepare(sql).all(...p);

/** board.js sampleVoice: these three words, chained. */
const SAMPLE_WORDS = [["I", null], ["want", "sns_0013"], ["apple", "sns_0128"]];

export function voiceModel(appId) {
  const db = appDb(appId);
  const { locale, voiceId } = resolveProfile(db);
  const { available, coming } = voiceChoices(db, locale);
  return {
    current: voiceId,
    currentName: voiceName(db, voiceId),
    choices: available.map((v) => ({
      id: v.id,
      name: voiceName(db, v.id),
      note: v.note,
      isDefault: !!v.is_default,
    })),
    coming: coming.map((v) => ({ name: v.name, note: v.note })),
  };
}

/** The sample's clip slots in `voice` (same shape as resolveSlot). */
export function voiceSample(appId, voice) {
  const db = appDb(appId);
  const { locale } = resolveProfile(db);
  return SAMPLE_WORDS.map(([text, sid]) => {
    const id = sid ?? all(db,
      `SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma'
       AND status = 'approved' AND locale = ?`, [text, locale])[0]?.id;
    return id ? resolveSlot(db, { kind: "sense", id }, locale, voice) : { type: "silence" };
  });
}
