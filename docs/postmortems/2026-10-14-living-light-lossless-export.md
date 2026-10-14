# Living Light lossless export decoder checkpoint

Source: Codex /root chat01a137cc-de1d-7511-ab65-227c92d5bca0.
Status: locally verified prepared-frame repair; managed encoded release pending.
Requirement LL-903 remains In Progress with its original acceptance criteria.

The second managed full-song attempt failed at frame3774; software decode passed
that interval but failed at4380. Two lossless diagnostic copies passed both points,
then the remaining original clip m44 failed at4587. These failures showed why
per-clip retries and a decoder switch were insufficient. All failed takes and
bounded diagnostics remain evidence; no failed tail was relabeled a pass.

Reused the existing source inspector, preparation process owner, content cache,
compiler and native renderer. Added a distinct lossless all-intra export profile,
separate original/compiled hashes and full decoded-frame/time checks. Existing
preview derivatives keep their own lossy fidelity and cache identity. Cache
corruption recovery, cancellation after partial output, metadata and source
preservation are verified. No source cut, audio or Journey revision is rewritten.

The initial VFR test caught a guessed final-frame duration. An attempted output
rate option was refused by the installed encoder; preserved explicit final sample
duration instead. The first real compile then caught fractional source timestamps
being rounded to nominal fps; preserving the demuxer timebase corrected it. Both
cases now have tests. The rotation test initially used metadata that did not
actually rotate its fixture; corrected it to the encoder's explicit input rotation
option, then verified the owner refusal. These were early check failures, not
accepted outputs. Lesson Card candidate: lossless pixel coding alone does not
prove temporal equivalence; retain and verify frame times and the final endpoint.

45 real pilot sources compile with7,928 source frames verified, and all4,911
forward requests pass in the actual prepared compositor. The byte-exact
reverse check failed at450 after three ordinary reverse hashes matched.
A short diagnostic and then a12-request focused repeat isolated20 tunnel
pixels differing by at most2/255 and12 portal pixels by1/255; ordinary
frames remain byte-identical. Visual inspection shows unchanged media,
geometry and framing. The focused repeat passes an explicit allowance of
32 changed pixels and2 levels across1920×1080; it does not establish
bit-exact GPU reproducibility or erase the original failure. No runtime
code was changed to address this rounding-only diagnostic. Process
baselines return with no unowned descendants.36 distinct passing affected checks include six new source/
packager checks,29 unchanged surrounding checks and one managed checkpoint test.
A broader data-inventory test fails on the unrelated Hey Sister project missing
its manifest schema; no full-suite pass is claimed and no project was mutated to
satisfy it. Build passes.38 original cuts, saved pilot child and exact Journey are
unchanged. Evidence: source chat workspace lossless-export/ under execution/living-light.

Next: refresh the already approved pilot certificate, reload the existing service
through its supervised owner, then retry and inspect the full managed encode.
Carry Calder's authorization forward without another permission question. Human
creative acceptance, mint/publication, all-profile and bound-source qualification
remain distinct. No GitHub mutation. Active implementation/verification minutes
were not measured; do not invent a speedup or completion percentage.
