# Brave Tongues — review output

Status: real local full-song execution verified; musical accuracy and human listening review pending.

Open **Echos Album → Audio Atlas → Brave Tongues**, choose the completed run from 2026-09-27 22:17 UTC (`af324ed0-1e0e-40e3-abd2-92f68c5c95b0`). It is the latest completed full profile from this task. The task preview is at loopback port19873 while its session remains running.

| Result | Observed output |
| --- | --- |
| Sources | 4:03.440 stereo master and all 12 stereo stems, 48 kHz |
| Files | MP3 master found;12/12 declared MP3 stem roles found; WAV not found at registered paths/counterparts |
| Processing | 61.550 seconds in this one local run |
| Words | 489 unreviewed Whisper candidates on the Vocals timeline |
| Rhythm | 486 beat /122 downbeat candidates;120 median inter-beat BPM |
| Sound retrieval | 25 master windows,10 seconds each except final valid3.440 seconds;16 CLAP concepts |
| Reconstruction | Summed stems suggest −18ms lag in 8/8 windows; no correction applied |

## Three useful listening checks

1. **2.8–11 seconds, Vocals, New word candidates.** Inspect the opening spoken line. Compare boundaries with the waveform/player; the integer coordinates locate estimates, not verified exact onsets.
2. **26–39 seconds, Vocals.** Supplied lyrics contain “Lost Ani’s book”; the model returns “Lost on his book.” At27.24/27.54 seconds its two words need listening and correction. Select a candidate to view its source/model evidence, audition it, then propose text/boundary changes with reviewer and note. Saving a correction appends a needs-review event and preserves original output. Do not accept an unchanged automatic transcript as ground truth.
3. **30–40 seconds, master.** Choose the “spoken voice” acoustic concept and Find matching sound. This is the highest-ranked10-second window at cosine0.364;60–70 seconds and 70–80 seconds follow around 0.343. Compare with the actual sound: these are rankings within a limited concept set, not a probability of speech or a verified section boundary. Select beat/downbeat candidates on the master to review rhythmic placement separately.

Source lyrics, imported timing, new words, rhythmic candidates and acoustic concepts remain distinct. Current candidates do not automatically replace Director lyrics/cuts. The model sometimes transforms names, wordplay and sung phrases; no word error rate or timing error was measured. Individual stem alignment remains unverified even though group reconstruction is consistent.

Phonemes, syllables, notes, diarization and open-ended semantic narration are still unsupported. The original pack is therefore only partially implemented. Full repository acceptance and the required completion commit also remain separate gates; see [verification](VERIFICATION.md).

Result SHA-256: `90a4557ddfa56583bd2588e2c99e492774b68efefa2c14c8ea0401835a0e5904`. Model/runtime provenance and raw evidence hashes are in the run export. Source media remains private and outside Git.
